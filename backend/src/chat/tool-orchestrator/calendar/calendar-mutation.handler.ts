import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { LlmService } from '../../../llm/llm.service';
import { PendingRequestService } from '../../pending-request.service';
import { CalendarTimezoneService } from './calendar-timezone.service';
import { extractCalendarMutationArgs } from '../tool-orchestrator-llm-extractors';
import { filterEventsForMutation } from './calendar-mutation-replies';
import {
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
  getSingleDayRangeLocal,
} from './calendar-ranges';
import { mergeTimeOnlyUpdateOntoEventDay } from './calendar-update-merge';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type {
  PendingCalendarDeletePayload,
  PendingCalendarMutateTzPayload,
  PendingCalendarUpdatePayload,
} from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';

@Injectable()
export class CalendarMutationHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly timezoneService: CalendarTimezoneService,
  ) { }

  formatCalendarUpdateSuccess(input: {
    title: string;
    url?: string;
  }): string {
    return (
      `Done — I updated **${input.title}** in your Google Calendar.` +
      (input.url ? `\n\nOpen in Calendar: ${input.url}` : '')
    );
  }

  async handleCalendarMutationIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const timeZone = await this.timezoneService.resolveTimeZone(sessionId, envelope);

    if (!timeZone) {
      this.pendingRequestService.setPending<PendingCalendarMutateTzPayload>(
        sessionId,
        {
          actionType: 'calendar_mutate_tz',
          originalMessage: message,
          payload: { message },
          missingSlots: ['timeZone'],
          collectedSlots: {},
        },
      );
      return this.timezoneService.formatTimezoneQuestion();
    }

    this.pendingRequestService.clearPending(sessionId, 'calendar_mutate_tz');

    return this.runCalendarMutation(sessionId, message, timeZone);
  }

  async runCalendarMutation(
    sessionId: string,
    userMessage: string,
    timeZone: string,
  ): Promise<string> {
    const extracted = await extractCalendarMutationArgs(
      this.llmService,
      userMessage,
      timeZone,
    );
    if (!extracted) {
      return (
        'I couldn’t tell which event or what to change. Try naming the event and the day ' +
        '(e.g. “move my dentist visit tomorrow to 4pm” or “cancel team sync Friday”).'
      );
    }

    if (extracted.operation === 'update') {
      if (!extracted.newTitle && !extracted.newStart && !extracted.newEnd) {
        return (
          'What should I change—title, time, or both? For example: “rename it to Budget review” or “move it to 4pm”.'
        );
      }
    }

    const nowLocal = DateTime.now().setZone(timeZone);
    let startLocal: string;
    let endLocal: string;

    if (extracted.searchWholeWeek) {
      ({ startLocal, endLocal } = getMonToSunRangeLocal(
        nowLocal,
        0,
      ));
    } else if (extracted.dayOffset !== null) {
      ({ startLocal, endLocal } = getSingleDayRangeLocal(
        nowLocal,
        extracted.dayOffset,
      ));
    } else {
      const days = extracted.searchNextDays ?? 14;
      ({ startLocal, endLocal } = getNextDaysRangeLocal(nowLocal, days));
    }

    try {
      const events = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: 40,
      });

      const candidates = filterEventsForMutation(
        events,
        extracted.titleKeywords,
      );

      if (candidates.length === 0) {
        return (
          'I didn’t find a matching event in that window. Try listing your calendar or ' +
          'being more specific about the title or date.'
        );
      }

      if (candidates.length === 1) {
        const c = candidates[0];
        if (extracted.operation === 'delete') {
          this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
            sessionId,
            {
              actionType: 'calendar_delete',
              originalMessage: userMessage,
              payload: {
                phase: 'confirm',
                timeZone,
                eventId: c.eventId,
                calendarId: c.calendarId,
                title: c.title,
                startText: c.startText,
              },
              missingSlots: ['confirmation'],
              collectedSlots: {},
            },
          );
          return (
            `I found **${c.title}** scheduled for ${c.startText}.\n\n` +
            `Do you want me to delete it from your Google Calendar? Reply yes to delete it, or cancel.`
          );
        }

        let start = extracted.newStart ?? undefined;
        let end = extracted.newEnd ?? undefined;
        if (!c.isAllDay && c.startLocalIso && (start || end)) {
          const merged = mergeTimeOnlyUpdateOntoEventDay({
            userMessage,
            timeZone,
            eventStartLocalIso: c.startLocalIso,
            eventEndLocalIso: c.endLocalIso,
            newStart: extracted.newStart,
            newEnd: extracted.newEnd,
          });
          if (merged) {
            start = merged.start;
            end = merged.end;
          }
        }
        const updated = await this.calendarService.updateEvent({
          sessionId,
          calendarId: c.calendarId,
          eventId: c.eventId,
          timeZone,
          title: extracted.newTitle ?? undefined,
          start,
          end,
        });
        return this.formatCalendarUpdateSuccess({
          title: updated.title,
          url: updated.url,
        });
      }

      const sliced = candidates.slice(0, 12);
      const options = sliced.map((e, i) => ({
        index: i + 1,
        eventId: e.eventId,
        calendarId: e.calendarId,
        title: e.title,
        startText: e.startText,
        startLocalIso: e.startLocalIso,
        endLocalIso: e.endLocalIso,
      }));

      if (extracted.operation === 'delete') {
        this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
          sessionId,
          {
            actionType: 'calendar_delete',
            originalMessage: userMessage,
            payload: { phase: 'pick', timeZone, options },
            missingSlots: ['targetEvent'],
            collectedSlots: {},
          },
        );
      } else {
        this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
          sessionId,
          {
            actionType: 'calendar_update',
            originalMessage: userMessage,
            payload: {
              phase: 'pick',
              timeZone,
              newTitle: extracted.newTitle,
              newStart: extracted.newStart,
              newEnd: extracted.newEnd,
              options,
            },
            missingSlots: ['targetEvent'],
            collectedSlots: {},
          },
        );
      }

      const lines = options.map(
        (o) => `${o.index}. ${o.title} — ${o.startText}`,
      );
      return (
        `I found several events. Reply with a number (1–${options.length}):\n\n` +
        `${lines.join('\n')}\n\n` +
        `Or say cancel.`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('search or change calendar events', e);
    }
  }
}
