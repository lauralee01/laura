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
      );

      const validUpdateDetails =
        extractedUpdateDetails?.operation === 'update' &&
        Boolean(
          extractedUpdateDetails.newTitle ||
            extractedUpdateDetails.newStart ||
            extractedUpdateDetails.newEnd,
        );

      if (!validUpdateDetails || !extractedUpdateDetails) {
        return (
          `What should I change for **${pendingUpdatePayload.title}**—` +
          'the title, time, or both?\n\n' +
          'For example: “rename it to Budget review” or “move it to 4pm”.'
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

    if (
      !savedNewTitle &&
      !savedNewStart &&
      !savedNewEnd &&
      !looksLikeBareEventPick(message)
    ) {
      const extractedTurnUpdate = await extractCalendarMutationArgs(
        this.llmService,
        message,
        pendingUpdatePayload.timeZone,
      );

      if (
        extractedTurnUpdate?.operation === 'update' &&
        Boolean(
          extractedTurnUpdate.newTitle ||
            extractedTurnUpdate.newStart ||
            extractedTurnUpdate.newEnd,
        )
      ) {
        savedNewTitle = extractedTurnUpdate.newTitle ?? null;
        savedNewStart = extractedTurnUpdate.newStart ?? null;
        savedNewEnd = extractedTurnUpdate.newEnd ?? null;
      }
    }

    const updateDetailsAreStillMissing =
      !savedNewTitle && !savedNewStart && !savedNewEnd;

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
        'What should I change—the title, time, or both?'
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
