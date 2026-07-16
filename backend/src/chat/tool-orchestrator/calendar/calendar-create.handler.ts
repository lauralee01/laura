import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { LlmService } from '../../../llm/llm.service';
import { PendingRequestService } from '../../pending-request.service';
import { CalendarTimezoneService } from './calendar-timezone.service';
import { extractCalendarEventArgs } from '../tool-orchestrator-llm-extractors';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type { PendingCalendarCreatePayload } from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';

@Injectable()
export class CalendarCreateHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly timezoneService: CalendarTimezoneService,
  ) { }

  private formatCalendarCreateSuccess(input: {
    title: string;
    start: string;
    end: string;
    timeZone: string;
    url?: string;
  }): string {
    return (
      `Done — I added it to your Google Calendar.\n\n` +
      `**${input.title}**\n` +
      `When: ${input.start} – ${input.end}\n` +
      `Time zone: ${input.timeZone}` +
      (input.url ? `\n\nOpen in Calendar: ${input.url}` : '')
    );
  }

  async handleCalendarCreateIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    try {
      const timeZone = await this.timezoneService.resolveTimeZone(
        sessionId,
        envelope,
      );

      const pending =
        this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
          sessionId,
          'calendar_create',
        );

      const baseMessage = pending
        ? `${pending.payload.message}\n\nAdditional user detail: ${message}`
        : message;

      const args = await extractCalendarEventArgs(
        this.llmService,
        baseMessage,
        timeZone,
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

        this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
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

      this.pendingRequestService.clearPending(sessionId, 'calendar_create');

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
  ): Promise<string> {
    try {
      const args = await extractCalendarEventArgs(
        this.llmService,
        originalMessage,
        timeZone,
      );
      if (!args || !args.title?.trim() || !args.start?.trim() || !args.end?.trim()) {
        this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
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
      this.pendingRequestService.clearPending(sessionId, 'calendar_create');
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
