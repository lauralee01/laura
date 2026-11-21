import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { LlmService } from '../../../llm/llm.service';
import { PendingRequestService } from '../../pending-request.service';
import type { ToolReplyInput } from '../../action-receipt.types';
import type { IntentEnvelope } from '../../intent/intent.types';
import type {
  PendingCalendarMutateTzPayload,
  PendingCalendarUpdatePayload,
} from '../tool-orchestrator.types';
import { extractCalendarMutationArgs } from '../tool-orchestrator-llm-extractors';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import {
  continuePendingDetailsUpdate,
  handleAmbiguousMutationMatches,
  handleUniqueMutationMatch,
} from './calendar-mutation-match-flows';
import { filterEventsForMutation } from './calendar-mutation-replies';
import { resolveReminderMinutesBefore } from './calendar-reminder-minutes';
import { resolveMutationSearchRange } from './calendar-mutation-search-range';
import {
  getIntentTitleHint,
  resolveMutationTitleKeywords,
} from './calendar-mutation-title';
import {
  CALENDAR_TIMEZONE_PROMPT,
  CalendarTimezoneService,
} from './calendar-timezone.service';

@Injectable()
export class CalendarMutationHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly timezoneService: CalendarTimezoneService,
  ) {}

  async handleCalendarMutationIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    try {
      const timeZone = await this.timezoneService.resolveTimeZone(
        sessionId,
        envelope,
      );

      if (!timeZone) {
        await this.pendingRequestService.setPending<PendingCalendarMutateTzPayload>(
          sessionId,
          {
            actionType: 'calendar_mutate_tz',
            originalMessage: message,
            payload: { message },
            missingSlots: ['timeZone'],
            collectedSlots: {},
          },
        );
        return CALENDAR_TIMEZONE_PROMPT;
      }

      return await this.runCalendarMutation({
        sessionId,
        userMessage: message,
        timeZone,
        envelope,
      });
    } catch (error: unknown) {
      return formatToolFailureMessage('update the calendar event', error);
    }
  }

  async runCalendarMutation(params: {
    sessionId: string;
    userMessage: string;
    timeZone: string;
    envelope?: IntentEnvelope;
  }): Promise<ToolReplyInput> {
    const { sessionId, userMessage, timeZone, envelope } = params;

    const preferredOperation =
      envelope?.intent === 'calendar_delete'
        ? ('delete' as const)
        : envelope?.intent === 'calendar_update'
          ? ('update' as const)
          : undefined;

    const extractedMutation = await extractCalendarMutationArgs(
      this.llmService,
      userMessage,
      timeZone,
      preferredOperation,
    );

    if (!extractedMutation) {
      return (
        'I couldn’t tell which event or what to change. Try naming the event and the day ' +
        '(e.g. “move my dentist visit tomorrow to 4pm” or “cancel team sync Friday”).'
      );
    }

    if (extractedMutation.operation === 'update') {
      const resolvedReminder = resolveReminderMinutesBefore({
        extracted: extractedMutation.reminderMinutesBefore,
        slotReminder: envelope?.slots?.reminder,
        userMessage,
      });
      extractedMutation.reminderMinutesBefore =
        resolvedReminder !== undefined ? resolvedReminder : null;
    }

    const resolvedTitleKeywords = resolveMutationTitleKeywords({
      extractedTitleKeyword: extractedMutation.titleKeywords,
      intentTitleHint: getIntentTitleHint(envelope),
    });

    const updateDetailsAreMissing =
      extractedMutation.operation === 'update' &&
      !extractedMutation.newTitle &&
      !extractedMutation.newStart &&
      !extractedMutation.newEnd &&
      extractedMutation.reminderMinutesBefore === null;

    const { startLocal, endLocal } = resolveMutationSearchRange(
      extractedMutation,
      timeZone,
    );

    const flowDeps = {
      sessionId,
      userMessage,
      timeZone,
      calendarService: this.calendarService,
      pendingRequestService: this.pendingRequestService,
    };

    try {
      const calendarEvents = await this.calendarService.listEvents({
        sessionId,
        timeZone,
        start: startLocal,
        end: endLocal,
        maxEvents: 40,
      });

      const matchingEventCandidates = filterEventsForMutation(
        calendarEvents,
        resolvedTitleKeywords,
      );

      const activePendingUpdate =
        await this.pendingRequestService.getPending<PendingCalendarUpdatePayload>(
          sessionId,
          'calendar_update',
        );

      const hasUpdateDetails =
        extractedMutation.operation === 'update' &&
        Boolean(
          extractedMutation.newTitle ||
            extractedMutation.newStart ||
            extractedMutation.newEnd ||
            extractedMutation.reminderMinutesBefore !== null,
        );

      if (
        activePendingUpdate &&
        activePendingUpdate.payload.phase === 'details' &&
        hasUpdateDetails
      ) {
        return continuePendingDetailsUpdate(
          flowDeps,
          activePendingUpdate.payload,
          extractedMutation,
        );
      }

      if (matchingEventCandidates.length === 0) {
        return (
          "I couldn't find an event that matches what you described. " +
          "Could you tell me the event name or the day it's scheduled? " +
          'That should help me find the right one.'
        );
      }

      if (matchingEventCandidates.length === 1) {
        return handleUniqueMutationMatch(
          flowDeps,
          matchingEventCandidates[0],
          extractedMutation,
          updateDetailsAreMissing,
        );
      }

      return handleAmbiguousMutationMatches(
        flowDeps,
        matchingEventCandidates,
        extractedMutation,
      );
    } catch (error: unknown) {
      return formatToolFailureMessage(
        'search or change calendar events',
        error,
      );
    }
  }
}
