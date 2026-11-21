import type { CalendarService } from '../../../integrations/calendar/calendar.service';
import type { ListCalendarEventSummary } from '../../../integrations/calendar/calendar.types';
import {
  CALENDAR_DELETE_CONFIRM_PROMPT,
  toolConfirm,
  toolOk,
  type ToolReplyInput,
} from '../../action-receipt.types';
import type { PendingRequestService } from '../../pending-request.service';
import type { CalendarMutationExtraction } from '../tool-orchestrator-llm-extractors';
import type {
  PendingCalendarDeletePayload,
  PendingCalendarUpdatePayload,
} from '../tool-orchestrator.types';
import { applyCalendarUpdate } from './calendar-apply-update';

type MatchFlowDeps = {
  sessionId: string;
  userMessage: string;
  timeZone: string;
  calendarService: CalendarService;
  pendingRequestService: PendingRequestService;
};

export async function continuePendingDetailsUpdate(
  deps: MatchFlowDeps,
  pending: PendingCalendarUpdatePayload & { phase: 'details' },
  extracted: CalendarMutationExtraction,
): Promise<ToolReplyInput> {
  const result = await applyCalendarUpdate({
    sessionId: deps.sessionId,
    calendarService: deps.calendarService,
    calendarId: pending.calendarId,
    eventId: pending.eventId,
    timeZone: deps.timeZone,
    title: extracted.newTitle,
    newStart: extracted.newStart,
    newEnd: extracted.newEnd,
    reminderMinutesBefore: extracted.reminderMinutesBefore,
    eventStartLocalIso: pending.startLocalIso,
    eventEndLocalIso: pending.endLocalIso,
    mergeUserMessage: deps.userMessage,
  });

  if (!result.ok) {
    return result.text;
  }

  await deps.pendingRequestService.clearPending(
    deps.sessionId,
    'calendar_update',
  );

  return result.receipt
    ? toolOk(result.text, result.receipt)
    : result.text;
}

export async function handleUniqueMutationMatch(
  deps: MatchFlowDeps,
  matched: ListCalendarEventSummary,
  extracted: CalendarMutationExtraction,
  updateDetailsAreMissing: boolean,
): Promise<ToolReplyInput> {
  if (extracted.operation === 'delete') {
    await deps.pendingRequestService.setPending<PendingCalendarDeletePayload>(
      deps.sessionId,
      {
        actionType: 'calendar_delete',
        originalMessage: deps.userMessage,
        payload: {
          phase: 'confirm',
          timeZone: deps.timeZone,
          eventId: matched.eventId,
          calendarId: matched.calendarId,
          title: matched.title,
          startText: matched.startText,
        },
        missingSlots: ['confirmation'],
        collectedSlots: {},
      },
    );

    return toolConfirm(
      `I found **${matched.title}** scheduled for ` +
        `${matched.startText}.\n\n` +
        'Do you want me to delete it from your Google Calendar? ' +
        'Reply yes to delete it, or cancel.',
      CALENDAR_DELETE_CONFIRM_PROMPT,
    );
  }

  /*
   * The target event is known, but the user has not said what should
   * change. Save the target so their next reply can continue without
   * another calendar search.
   */
  if (updateDetailsAreMissing) {
    await deps.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
      deps.sessionId,
      {
        actionType: 'calendar_update',
        originalMessage: deps.userMessage,
        payload: {
          phase: 'details',
          timeZone: deps.timeZone,
          eventId: matched.eventId,
          calendarId: matched.calendarId,
          title: matched.title,
          startText: matched.startText,
          startLocalIso: matched.startLocalIso,
          endLocalIso: matched.endLocalIso,
        },
        missingSlots: ['updateDetails'],
        collectedSlots: {},
      },
    );

    return (
      `I found **${matched.title}** scheduled for ` +
      `${matched.startText}.\n\n` +
      'What should I change—the title, time, reminder, or a mix? For example, ' +
      '“rename it to Budget review”, “move it to 4pm”, or “remind me one hour before”.'
    );
  }

  const result = await applyCalendarUpdate({
    sessionId: deps.sessionId,
    calendarService: deps.calendarService,
    calendarId: matched.calendarId,
    eventId: matched.eventId,
    timeZone: deps.timeZone,
    title: extracted.newTitle,
    newStart: extracted.newStart,
    newEnd: extracted.newEnd,
    reminderMinutesBefore: extracted.reminderMinutesBefore,
    eventStartLocalIso: matched.isAllDay
      ? undefined
      : matched.startLocalIso,
    eventEndLocalIso: matched.endLocalIso,
    mergeUserMessage: deps.userMessage,
  });

  if (!result.ok) {
    return result.text;
  }

  return result.receipt
    ? toolOk(result.text, result.receipt)
    : result.text;
}

export async function handleAmbiguousMutationMatches(
  deps: MatchFlowDeps,
  candidates: ListCalendarEventSummary[],
  extracted: CalendarMutationExtraction,
): Promise<ToolReplyInput> {
  /*
   * More than one event matched. Store both the event choices and the
   * requested changes so the pending resolver can apply those changes
   * after the user replies with a number.
   */
  const eventSelectionOptions = candidates.slice(0, 12).map((event, i) => ({
    index: i + 1,
    eventId: event.eventId,
    calendarId: event.calendarId,
    title: event.title,
    startText: event.startText,
    startLocalIso: event.startLocalIso,
    endLocalIso: event.endLocalIso,
  }));

  if (extracted.operation === 'delete') {
    await deps.pendingRequestService.setPending<PendingCalendarDeletePayload>(
      deps.sessionId,
      {
        actionType: 'calendar_delete',
        originalMessage: deps.userMessage,
        payload: {
          phase: 'pick',
          timeZone: deps.timeZone,
          options: eventSelectionOptions,
        },
        missingSlots: ['targetEvent'],
        collectedSlots: {},
      },
    );
  } else {
    await deps.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
      deps.sessionId,
      {
        actionType: 'calendar_update',
        originalMessage: deps.userMessage,
        payload: {
          phase: 'pick',
          timeZone: deps.timeZone,
          newTitle: extracted.newTitle,
          newStart: extracted.newStart,
          newEnd: extracted.newEnd,
          reminderMinutesBefore: extracted.reminderMinutesBefore,
          options: eventSelectionOptions,
        },
        missingSlots: ['targetEvent'],
        collectedSlots: {},
      },
    );
  }

  const eventSelectionLines = eventSelectionOptions.map(
    (option) => `${option.index}. ${option.title} — ${option.startText}`,
  );

  return (
    `I found several events. Reply with a number ` +
    `(1–${eventSelectionOptions.length}):\n\n` +
    `${eventSelectionLines.join('\n')}\n\n` +
    'Or say cancel.'
  );
}
