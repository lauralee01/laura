import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { LlmService } from '../../../llm/llm.service';
import {
  toolOk,
  type ToolReplyInput,
} from '../../action-receipt.types';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import {
  CALENDAR_TIMEZONE_PROMPT,
  CalendarTimezoneService,
} from './calendar-timezone.service';
import { extractCalendarEventArgs } from '../tool-orchestrator-llm-extractors';
import { getSlotString } from '../tool-orchestrator.intent-slots';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type { PendingCalendarCreatePayload } from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';
import { DEFAULT_MEETING_MINUTES } from '../../session-prefs.types';

function slotHintsFromEnvelope(envelope?: IntentEnvelope) {
  return {
    title: getSlotString(envelope, 'titleHint') ?? undefined,
    start: getSlotString(envelope, 'startTime') ?? undefined,
    end: getSlotString(envelope, 'endTime') ?? undefined,
  };
}

@Injectable()
export class CalendarCreateHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly timezoneService: CalendarTimezoneService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) { }

  private async defaultMeetingMinutes(sessionId: string): Promise<number> {
    try {
      const prefs = await this.sessionPreferences.getSessionPrefs(sessionId);
      return prefs.defaultMeetingMinutes || DEFAULT_MEETING_MINUTES;
    } catch {
      return DEFAULT_MEETING_MINUTES;
    }
  }

  private formatCalendarCreateSuccess(input: {
    title: string;
    start: string;
    end: string;
    timeZone: string;
    url?: string;
  }): ToolReplyInput {
    const text =
      `Done — I added it to your Google Calendar.\n\n` +
      `**${input.title}**\n` +
      `When: ${input.start} – ${input.end}\n` +
      `Time zone: ${input.timeZone}` +
      (input.url ? `\n\nOpen in Calendar: ${input.url}` : '');

    return toolOk(text, {
      kind: 'calendar_created',
      title: 'Event added to Calendar',
      detail: `${input.title} · ${input.start} – ${input.end}`,
    });
  }

  async handleCalendarCreateIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    try {
      const pending =
        await this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
          sessionId,
          'calendar_create',
        );

      const baseMessage = pending
        ? `${pending.payload.message}\n\nAdditional user detail: ${message}`
        : message;

      const timeZone = await this.timezoneService.resolveTimeZone(
        sessionId,
        envelope,
      );

      if (!timeZone) {
        await this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
          sessionId,
          {
            actionType: 'calendar_create',
            originalMessage: baseMessage,
            payload: { message: baseMessage },
            missingSlots: ['timeZone'],
            collectedSlots: {},
          },
        );
        return CALENDAR_TIMEZONE_PROMPT;
      }

      const args = await extractCalendarEventArgs(
        this.llmService,
        baseMessage,
        timeZone,
        slotHintsFromEnvelope(envelope),
        await this.defaultMeetingMinutes(sessionId),
      );

      if (
        !args ||
        !args.title?.trim() ||
        !args.start?.trim() ||
        !args.end?.trim()
      ) {
        const missingSlots: Array<'title' | 'timeRange'> = [];

        if (!args?.title?.trim()) {
          missingSlots.push('title');
        }

        if (!args?.start?.trim() || !args?.end?.trim()) {
          missingSlots.push('timeRange');
        }

        await this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
          sessionId,
          {
            actionType: 'calendar_create',
            originalMessage: baseMessage,
            payload: { message: baseMessage },
            missingSlots,
            collectedSlots: {},
          },
        );

        if (!args?.title?.trim()) {
          return 'What should I call this calendar event?';
        }

        return (
          `What time should I block for **${args.title}**?\n\n` +
          'For example: tomorrow from 5 PM to 7 PM.'
        );
      }

      const event = await this.calendarService.createEvent({
        sessionId,
        title: args.title,
        start: args.start,
        end: args.end,
        description: args.description,
        reminderMinutesBefore: args.reminderMinutesBefore,
        timeZone,
      });

      await this.pendingRequestService.clearPending(sessionId, 'calendar_create');

      return this.formatCalendarCreateSuccess({
        title: event.title,
        start: args.start,
        end: args.end,
        timeZone,
        url: event.url,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('create the calendar event', e);
    }
  }

  async completeCreateAfterTimezone(
    sessionId: string,
    timeZone: string,
    originalMessage: string,
  ): Promise<ToolReplyInput> {
    try {
      const args = await extractCalendarEventArgs(
        this.llmService,
        originalMessage,
        timeZone,
        undefined,
        await this.defaultMeetingMinutes(sessionId),
      );
      if (!args || !args.title?.trim() || !args.start?.trim() || !args.end?.trim()) {
        await this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
          sessionId,
          {
            actionType: 'calendar_create',
            originalMessage,
            payload: { message: originalMessage },
            missingSlots: [
              !args?.title?.trim() ? 'title' : null,
              !args?.start?.trim() || !args?.end?.trim() ? 'timeRange' : null,
            ].filter((x): x is 'title' | 'timeRange' => x !== null),
            collectedSlots: {},
          },
        );

        if (!args?.title?.trim()) {
          return `I saved your timezone as ${timeZone}. What should I call this calendar event?`;
        }

        return (
          `I saved your timezone as ${timeZone}. ` +
          `What time should I block for **${args.title}**?\n\n` +
          `For example: tomorrow from 5 PM to 7 PM.`
        );
      }

      const event = await this.calendarService.createEvent({
        sessionId,
        title: args.title,
        start: args.start,
        end: args.end,
        description: args.description,
        reminderMinutesBefore: args.reminderMinutesBefore,
        timeZone,
      });
      await this.pendingRequestService.clearPending(sessionId, 'calendar_create');
      return this.formatCalendarCreateSuccess({
        title: event.title,
        start: args.start,
        end: args.end,
        timeZone,
        url: event.url,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('create the calendar event', e);
    }
  }
}
