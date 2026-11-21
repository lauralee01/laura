import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import { LlmService } from '../../../llm/llm.service';
import type { ToolReplyInput } from '../../action-receipt.types';
import type { IntentEnvelope } from '../../intent/intent.types';
import { PendingRequestService } from '../../pending-request.service';
import type { PendingRequest } from '../../pending-request.service';
import { extractCalendarMutationArgs } from '../tool-orchestrator-llm-extractors';
import { getSlotSelectedIndex } from '../tool-orchestrator.intent-slots';
import type { PendingCalendarUpdatePayload } from '../tool-orchestrator.types';
import { applyCalendarUpdate } from './calendar-apply-update';
import {
  looksLikeBareEventPick,
  pickUniqueTitleMatch,
} from './calendar-event-pick';
import { resolveReminderMinutesBefore } from './calendar-reminder-minutes';

@Injectable()
export class CalendarPendingUpdateFlow {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly llmService: LlmService,
  ) { }

  async handle(
    sessionId: string,
    message: string,
    pendingUpdate: PendingRequest<PendingCalendarUpdatePayload>,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    if (envelope?.intent === 'pending_cancel') {
      await this.pendingRequestService.clearPending(
        sessionId,
        'calendar_update',
      );
      return 'Okay — I won’t update anything.';
    }

    const pendingUpdatePayload = pendingUpdate.payload;

    if (pendingUpdatePayload.phase === 'details') {
      const extractedUpdateDetails = await extractCalendarMutationArgs(
        this.llmService,
        message,
        pendingUpdatePayload.timeZone,
        'update',
      );

      if (extractedUpdateDetails?.operation === 'update') {
        const resolvedReminder = resolveReminderMinutesBefore({
          extracted: extractedUpdateDetails.reminderMinutesBefore,
          slotReminder: envelope?.slots?.reminder,
          userMessage: message,
        });
        extractedUpdateDetails.reminderMinutesBefore =
          resolvedReminder !== undefined ? resolvedReminder : null;
      }

      const validUpdateDetails =
        extractedUpdateDetails?.operation === 'update' &&
        Boolean(
          extractedUpdateDetails.newTitle ||
            extractedUpdateDetails.newStart ||
            extractedUpdateDetails.newEnd ||
            extractedUpdateDetails.reminderMinutesBefore !== null,
        );

      if (!validUpdateDetails || !extractedUpdateDetails) {
        return (
          `What should I change for **${pendingUpdatePayload.title}**—` +
          'the title, time, reminder, or a mix?\n\n' +
          'For example: “rename it to Budget review”, “move it to 4pm”, or “remind me one hour before”.'
        );
      }

      const result = await applyCalendarUpdate({
        sessionId,
        calendarService: this.calendarService,
        calendarId: pendingUpdatePayload.calendarId,
        eventId: pendingUpdatePayload.eventId,
        timeZone: pendingUpdatePayload.timeZone,
        title: extractedUpdateDetails.newTitle,
        newStart: extractedUpdateDetails.newStart,
        newEnd: extractedUpdateDetails.newEnd,
        reminderMinutesBefore: extractedUpdateDetails.reminderMinutesBefore,
        eventStartLocalIso: pendingUpdatePayload.startLocalIso,
        eventEndLocalIso: pendingUpdatePayload.endLocalIso,
        mergeUserMessage: message,
      });

      if (result.ok) {
        await this.pendingRequestService.clearPending(
          sessionId,
          'calendar_update',
        );
        return { text: result.text, receipt: result.receipt };
      }

      return result.text;
    }

    const selectedOptionIndex = getSlotSelectedIndex(
      envelope,
      pendingUpdatePayload.options.length,
    );

    let selectedCalendarEvent =
      selectedOptionIndex !== null &&
      selectedOptionIndex >= 1 &&
      selectedOptionIndex <= pendingUpdatePayload.options.length
        ? pendingUpdatePayload.options[selectedOptionIndex - 1]
        : undefined;

    if (!selectedCalendarEvent) {
      selectedCalendarEvent =
        pickUniqueTitleMatch(message, pendingUpdatePayload.options) ??
        undefined;
    }

    if (!selectedCalendarEvent) {
      return (
        `Reply with a number 1–${pendingUpdatePayload.options.length} ` +
        'for the event to update, or say cancel.'
      );
    }

    let savedNewTitle = pendingUpdatePayload.newTitle ?? null;
    let savedNewStart = pendingUpdatePayload.newStart ?? null;
    let savedNewEnd = pendingUpdatePayload.newEnd ?? null;
    let savedReminderMinutesBefore =
      pendingUpdatePayload.reminderMinutesBefore ?? null;

    if (
      !savedNewTitle &&
      !savedNewStart &&
      !savedNewEnd &&
      savedReminderMinutesBefore === null &&
      !looksLikeBareEventPick(message)
    ) {
      const extractedTurnUpdate = await extractCalendarMutationArgs(
        this.llmService,
        message,
        pendingUpdatePayload.timeZone,
        'update',
      );

      if (extractedTurnUpdate?.operation === 'update') {
        const resolvedReminder = resolveReminderMinutesBefore({
          extracted: extractedTurnUpdate.reminderMinutesBefore,
          slotReminder: envelope?.slots?.reminder,
          userMessage: message,
        });
        extractedTurnUpdate.reminderMinutesBefore =
          resolvedReminder !== undefined ? resolvedReminder : null;
      }

      if (
        extractedTurnUpdate?.operation === 'update' &&
        Boolean(
          extractedTurnUpdate.newTitle ||
            extractedTurnUpdate.newStart ||
            extractedTurnUpdate.newEnd ||
            extractedTurnUpdate.reminderMinutesBefore !== null,
        )
      ) {
        savedNewTitle = extractedTurnUpdate.newTitle ?? null;
        savedNewStart = extractedTurnUpdate.newStart ?? null;
        savedNewEnd = extractedTurnUpdate.newEnd ?? null;
        savedReminderMinutesBefore =
          extractedTurnUpdate.reminderMinutesBefore ?? null;
      }
    }

    const updateDetailsAreStillMissing =
      !savedNewTitle &&
      !savedNewStart &&
      !savedNewEnd &&
      savedReminderMinutesBefore === null;

    if (updateDetailsAreStillMissing) {
      await this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
        sessionId,
        {
          actionType: 'calendar_update',
          originalMessage: pendingUpdate.originalMessage,
          payload: {
            phase: 'details',
            timeZone: pendingUpdatePayload.timeZone,
            eventId: selectedCalendarEvent.eventId,
            calendarId: selectedCalendarEvent.calendarId,
            title: selectedCalendarEvent.title,
            startText: selectedCalendarEvent.startText,
            startLocalIso: selectedCalendarEvent.startLocalIso,
            endLocalIso: selectedCalendarEvent.endLocalIso,
          },
          missingSlots: ['updateDetails'],
          collectedSlots: {},
        },
      );

      return (
        `I found **${selectedCalendarEvent.title}** scheduled for ` +
        `${selectedCalendarEvent.startText}.\n\n` +
        'What should I change—the title, time, reminder, or a mix?'
      );
    }

    const result = await applyCalendarUpdate({
      sessionId,
      calendarService: this.calendarService,
      calendarId: selectedCalendarEvent.calendarId,
      eventId: selectedCalendarEvent.eventId,
      timeZone: pendingUpdatePayload.timeZone,
      title: savedNewTitle,
      newStart: savedNewStart,
      newEnd: savedNewEnd,
      reminderMinutesBefore: savedReminderMinutesBefore,
      eventStartLocalIso: selectedCalendarEvent.startLocalIso,
      eventEndLocalIso: selectedCalendarEvent.endLocalIso,
      mergeUserMessage: pendingUpdate.originalMessage,
    });

    if (result.ok) {
      await this.pendingRequestService.clearPending(
        sessionId,
        'calendar_update',
      );
      return { text: result.text, receipt: result.receipt };
    }

    return result.text;
  }
}
