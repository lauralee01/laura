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
  PendingCalendarUpdatePayload,
} from '../tool-orchestrator.types';
import type { IntentEnvelope } from '../../intent/intent.types';

const CALENDAR_MUTATION_LOG_PREFIX = '[calendar-mutation]';

function getIntentTitleHint(
  envelope?: IntentEnvelope,
): string | null {
  const titleHint = envelope?.slots?.titleHint;

  if (typeof titleHint !== 'string') {
    return null;
  }

  return titleHint.trim() || null;
}

function resolveMutationTitleKeywords(params: {
  extractedTitleKeyword: string | null | undefined;
  intentTitleHint: string | null;
}): string {
  const normalizedExtractedTitleKeyword =
    params.extractedTitleKeyword?.trim();

  if (normalizedExtractedTitleKeyword) {
    return normalizedExtractedTitleKeyword;
  }

  return params.intentTitleHint?.trim() || '';
}

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
    try {
      const timeZone = await this.timezoneService.resolveTimeZone(
        sessionId,
        envelope,
      );

      return await this.runCalendarMutation({
        sessionId,
        userMessage: message,
        timeZone,
        envelope,
      });
    } catch (error: unknown) {
      return formatToolFailureMessage(
        'update the calendar event',
        error,
      );
    }
  }

  async runCalendarMutation(params: {
    sessionId: string;
    userMessage: string;
    timeZone: string;
    envelope?: IntentEnvelope;
  }): Promise<string> {
    const {
      sessionId,
      userMessage,
      timeZone,
      envelope,
    } = params;

    const intentTitleHint = getIntentTitleHint(envelope);

    const extractedMutation = await extractCalendarMutationArgs(
      this.llmService,
      userMessage,
      timeZone,
    );

    if (!extractedMutation) {
      return (
        'I couldn’t tell which event or what to change. Try naming the event and the day ' +
        '(e.g. “move my dentist visit tomorrow to 4pm” or “cancel team sync Friday”).'
      );
    }

    const resolvedTitleKeywords = resolveMutationTitleKeywords({
      extractedTitleKeyword: extractedMutation.titleKeywords,
      intentTitleHint,
    });

    const updateDetailsAreMissing =
      extractedMutation.operation === 'update' &&
      !extractedMutation.newTitle &&
      !extractedMutation.newStart &&
      !extractedMutation.newEnd;

    const currentDateTimeInUserTimeZone =
      DateTime.now().setZone(timeZone);

    let calendarSearchStartLocal: string;
    let calendarSearchEndLocal: string;

    if (extractedMutation.searchWholeWeek) {
      ({
        startLocal: calendarSearchStartLocal,
        endLocal: calendarSearchEndLocal,
      } = getMonToSunRangeLocal(
        currentDateTimeInUserTimeZone,
        extractedMutation.weekOffset ?? 0,
      ));
    } else if (extractedMutation.dayOffset !== null) {
      ({
        startLocal: calendarSearchStartLocal,
        endLocal: calendarSearchEndLocal,
      } = getSingleDayRangeLocal(
        currentDateTimeInUserTimeZone,
        extractedMutation.dayOffset,
      ));
    } else {
      const numberOfDaysToSearch =
        extractedMutation.searchNextDays ?? 14;

      ({
        startLocal: calendarSearchStartLocal,
        endLocal: calendarSearchEndLocal,
      } = getNextDaysRangeLocal(
        currentDateTimeInUserTimeZone,
        numberOfDaysToSearch,
      ));
    }

    try {
      const calendarEvents =
        await this.calendarService.listEvents({
          sessionId,
          timeZone,
          start: calendarSearchStartLocal,
          end: calendarSearchEndLocal,
          maxEvents: 40,
        });

      const matchingEventCandidates = filterEventsForMutation(
        calendarEvents,
        resolvedTitleKeywords,
      );

      const activePendingUpdate =
        this.pendingRequestService.getPending<PendingCalendarUpdatePayload>(
          sessionId,
          'calendar_update',
        );

      const hasUpdateDetails =
        extractedMutation.operation === 'update' &&
        Boolean(
          extractedMutation.newTitle ||
            extractedMutation.newStart ||
            extractedMutation.newEnd,
        );

      if (
        activePendingUpdate &&
        activePendingUpdate.payload.phase === 'details' &&
        hasUpdateDetails
      ) {
        const p = activePendingUpdate.payload;
        let resolvedUpdatedStart =
          extractedMutation.newStart ?? undefined;
        let resolvedUpdatedEnd =
          extractedMutation.newEnd ?? undefined;

        if (
          p.startLocalIso &&
          (resolvedUpdatedStart || resolvedUpdatedEnd)
        ) {
          const mergedTimeOnlyUpdate =
            mergeTimeOnlyUpdateOntoEventDay({
              userMessage,
              timeZone,
              eventStartLocalIso: p.startLocalIso,
              eventEndLocalIso: p.endLocalIso,
              newStart: extractedMutation.newStart,
              newEnd: extractedMutation.newEnd,
            });

          if (mergedTimeOnlyUpdate) {
            resolvedUpdatedStart = mergedTimeOnlyUpdate.start;
            resolvedUpdatedEnd = mergedTimeOnlyUpdate.end;
          }
        }

        const updatedCalendarEvent =
          await this.calendarService.updateEvent({
            sessionId,
            calendarId: p.calendarId,
            eventId: p.eventId,
            timeZone,
            title: extractedMutation.newTitle ?? undefined,
            start: resolvedUpdatedStart,
            end: resolvedUpdatedEnd,
          });

        this.pendingRequestService.clearPending(
          sessionId,
          'calendar_update',
        );

        return this.formatCalendarUpdateSuccess({
          title: updatedCalendarEvent.title,
          url: updatedCalendarEvent.url,
        });
      }

      if (matchingEventCandidates.length === 0) {
        return (
          "I couldn't find an event that matches what you described. " +
          "Could you tell me the event name or the day it's scheduled? " +
          'That should help me find the right one.'
        );
      }

      if (matchingEventCandidates.length === 1) {
        const matchedCalendarEvent =
          matchingEventCandidates[0];

        if (extractedMutation.operation === 'delete') {
          this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
            sessionId,
            {
              actionType: 'calendar_delete',
              originalMessage: userMessage,
              payload: {
                phase: 'confirm',
                timeZone,
                eventId: matchedCalendarEvent.eventId,
                calendarId: matchedCalendarEvent.calendarId,
                title: matchedCalendarEvent.title,
                startText: matchedCalendarEvent.startText,
              },
              missingSlots: ['confirmation'],
              collectedSlots: {},
            },
          );

          return (
            `I found **${matchedCalendarEvent.title}** scheduled for ` +
            `${matchedCalendarEvent.startText}.\n\n` +
            'Do you want me to delete it from your Google Calendar? ' +
            'Reply yes to delete it, or cancel.'
          );
        }

        /*
         * The target event is known, but the user has not said what should
         * change. Save the target so their next reply can continue without
         * another calendar search.
         */
        if (updateDetailsAreMissing) {
          this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
            sessionId,
            {
              actionType: 'calendar_update',
              originalMessage: userMessage,
              payload: {
                phase: 'details',
                timeZone,
                eventId: matchedCalendarEvent.eventId,
                calendarId: matchedCalendarEvent.calendarId,
                title: matchedCalendarEvent.title,
                startText: matchedCalendarEvent.startText,
                startLocalIso:
                  matchedCalendarEvent.startLocalIso,
                endLocalIso:
                  matchedCalendarEvent.endLocalIso,
              },
              missingSlots: ['updateDetails'],
              collectedSlots: {},
            },
          );

          return (
            `I found **${matchedCalendarEvent.title}** scheduled for ` +
            `${matchedCalendarEvent.startText}.\n\n` +
            'What should I change—the title, time, or both? For example, ' +
            '“rename it to Budget review” or “move it to 4pm”.'
          );
        }

        let resolvedUpdatedStart =
          extractedMutation.newStart ?? undefined;

        let resolvedUpdatedEnd =
          extractedMutation.newEnd ?? undefined;

        /*
         * When the user supplies only a clock time, the extractor may attach
         * that time to today. Preserve the matched event's original calendar
         * date and apply only the newly requested clock time.
         */
        if (
          !matchedCalendarEvent.isAllDay &&
          matchedCalendarEvent.startLocalIso &&
          (resolvedUpdatedStart || resolvedUpdatedEnd)
        ) {
          const mergedTimeOnlyUpdate =
            mergeTimeOnlyUpdateOntoEventDay({
              userMessage,
              timeZone,
              eventStartLocalIso:
                matchedCalendarEvent.startLocalIso,
              eventEndLocalIso:
                matchedCalendarEvent.endLocalIso,
              newStart: extractedMutation.newStart,
              newEnd: extractedMutation.newEnd,
            });

          if (mergedTimeOnlyUpdate) {
            resolvedUpdatedStart =
              mergedTimeOnlyUpdate.start;

            resolvedUpdatedEnd =
              mergedTimeOnlyUpdate.end;

          }
        }
        const updatedCalendarEvent =
          await this.calendarService.updateEvent({
            sessionId,
            calendarId: matchedCalendarEvent.calendarId,
            eventId: matchedCalendarEvent.eventId,
            timeZone,
            title:
              extractedMutation.newTitle ?? undefined,
            start: resolvedUpdatedStart,
            end: resolvedUpdatedEnd,
          });

        return this.formatCalendarUpdateSuccess({
          title: updatedCalendarEvent.title,
          url: updatedCalendarEvent.url,
        });
      }

      /*
       * More than one event matched. Store both the event choices and the
       * requested changes so the pending resolver can apply those changes
       * after the user replies with a number.
       */
      const eventSelectionOptions = matchingEventCandidates
        .slice(0, 12)
        .map((event, optionIndex) => ({
          index: optionIndex + 1,
          eventId: event.eventId,
          calendarId: event.calendarId,
          title: event.title,
          startText: event.startText,
          startLocalIso: event.startLocalIso,
          endLocalIso: event.endLocalIso,
        }));

      if (extractedMutation.operation === 'delete') {
        this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
          sessionId,
          {
            actionType: 'calendar_delete',
            originalMessage: userMessage,
            payload: {
              phase: 'pick',
              timeZone,
              options: eventSelectionOptions,
            },
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
              newTitle: extractedMutation.newTitle,
              newStart: extractedMutation.newStart,
              newEnd: extractedMutation.newEnd,
              options: eventSelectionOptions,
            },
            missingSlots: ['targetEvent'],
            collectedSlots: {},
          },
        );
      }

      const eventSelectionLines =
        eventSelectionOptions.map(
          (option) =>
            `${option.index}. ${option.title} — ${option.startText}`,
        );

      return (
        `I found several events. Reply with a number ` +
        `(1–${eventSelectionOptions.length}):\n\n` +
        `${eventSelectionLines.join('\n')}\n\n` +
        'Or say cancel.'
      );
    } catch (error: unknown) {
      return formatToolFailureMessage(
        'search or change calendar events',
        error,
      );
    }
  }
}