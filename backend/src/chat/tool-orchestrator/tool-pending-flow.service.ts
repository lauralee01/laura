import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../integrations/calendar/calendar.service';
import { SessionPreferencesService } from '../session-preferences.service';
import { PendingRequestService } from '../pending-request.service';
import { CalendarListHandler } from './calendar/calendar-list.handler';
import { CalendarCreateHandler } from './calendar/calendar-create.handler';
import { CalendarMutationHandler } from './calendar/calendar-mutation.handler';
import { EmailToolHandler } from './email/email-tool.handler';
import { mergeTimeOnlyUpdateOntoEventDay } from './calendar/calendar-update-merge';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
import { LlmService } from 'src/llm/llm.service';
import {
  getSlotSelectedIndex,
  getSlotTimeZone,
} from './tool-orchestrator.intent-slots';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarDeletePayload,
  PendingCalendarListPayload,
  PendingCalendarMutateTzPayload,
  PendingCalendarUpdatePayload,
} from './tool-orchestrator.types';
import type { IntentEnvelope } from '../intent/intent.types';
import { extractCalendarMutationArgs } from './tool-orchestrator-llm-extractors';

/**
 * Multi-turn “pending” routes: email draft is handled first, then calendar delete/update
 * picks and confirmations, then `set_timezone` resumes blocked calendar create/list/mutation.
 * This is the fallback path when ChatService does not route purely from Stage-1 intent.
 */
@Injectable()
export class ToolPendingFlowService {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly llmService: LlmService,
    private readonly calendarListHandler: CalendarListHandler,
    private readonly calendarCreateHandler: CalendarCreateHandler,
    private readonly calendarMutationHandler: CalendarMutationHandler,
    private readonly emailTools: EmailToolHandler,
  ) { }

  async tryHandle(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    const pendingEmail = await this.emailTools.handlePendingEmailSendTurn(
      sessionId,
      message,
      envelope,
    );
    if (pendingEmail !== null) return pendingEmail;

    const pendingCreate =
      this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );

    if (pendingCreate && envelope?.intent !== 'set_timezone') {
      if (envelope?.intent === 'pending_cancel') {
        this.pendingRequestService.clearPending(sessionId, 'calendar_create');
        return 'No problem — I won’t add that to your calendar.';
      }

      return this.calendarCreateHandler.handleCalendarCreateIntent(
        sessionId,
        message,
        envelope,
      );
    }

    const pendingDelete =
      this.pendingRequestService.getPending<PendingCalendarDeletePayload>(
        sessionId,
        'calendar_delete',
      );
    if (pendingDelete) {
      if (envelope?.intent === 'pending_cancel') {
        this.pendingRequestService.clearPending(sessionId, 'calendar_delete');
        return (
          'Okay — I won’t delete anything. Ask again when you want to remove an event.'
        );
      }
      const p = pendingDelete.payload;
      if (p.phase === 'pick') {
        const idx = getSlotSelectedIndex(envelope, p.options.length);
        let opt = idx !== null && idx >= 1 && idx <= p.options.length ? p.options[idx - 1] : undefined;

        if (!opt) {
          const lowerMsg = message.toLowerCase().trim();
          const matchedByTitle = p.options.filter((o) => {
            const titleLower = o.title.toLowerCase();
            return lowerMsg.includes(titleLower) || titleLower.includes(lowerMsg);
          });
          if (matchedByTitle.length === 1) {
            opt = matchedByTitle[0];
          }
        }

        if (!opt) {
          return (
            `Reply with a number 1–${p.options.length} for the event to delete, or say cancel.`
          );
        }
        this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
          sessionId,
          {
            actionType: 'calendar_delete',
            originalMessage: pendingDelete.originalMessage,
            payload: {
              phase: 'confirm',
              timeZone: p.timeZone,
              eventId: opt.eventId,
              calendarId: opt.calendarId,
              title: opt.title,
              startText: opt.startText,
            },
            missingSlots: ['confirmation'],
            collectedSlots: {},
          },
        );
        return (
          `Delete “${opt.title}” (${opt.startText})?\n\n` +
          `Reply yes to remove it from Google Calendar, or cancel.`
        );
      }
      if (envelope?.intent === 'pending_confirm') {
        try {
          await this.calendarService.deleteEvent(
            sessionId,
            p.calendarId,
            p.eventId,
          );
          this.pendingRequestService.clearPending(sessionId, 'calendar_delete');
          return (
            `Deleted from Google Calendar: “${p.title}” (${p.startText}).`
          );
        } catch (e: unknown) {
          return formatToolFailureMessage('delete the calendar event', e);
        }
      }
      return (
        `Still waiting: delete “${p.title}”?\n` +
        `Reply yes to confirm, or cancel.`
      );
    }

    const pendingUpdate =
      this.pendingRequestService.getPending<PendingCalendarUpdatePayload>(
        sessionId,
        'calendar_update',
      );

    if (pendingUpdate) {
      if (envelope?.intent === 'pending_cancel') {
        this.pendingRequestService.clearPending(
          sessionId,
          'calendar_update',
        );

        return 'Okay — I won’t update anything.';
      }

      const pendingUpdatePayload = pendingUpdate.payload;

      if (pendingUpdatePayload.phase === 'details') {
        const extractedUpdateDetails =
          await extractCalendarMutationArgs(
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

        let resolvedUpdatedStart =
          extractedUpdateDetails.newStart ?? undefined;

        let resolvedUpdatedEnd =
          extractedUpdateDetails.newEnd ?? undefined;

        if (
          pendingUpdatePayload.startLocalIso &&
          (resolvedUpdatedStart || resolvedUpdatedEnd)
        ) {
          const mergedTimeOnlyUpdate =
            mergeTimeOnlyUpdateOntoEventDay({
              userMessage: message,
              timeZone: pendingUpdatePayload.timeZone,
              eventStartLocalIso:
                pendingUpdatePayload.startLocalIso,
              eventEndLocalIso:
                pendingUpdatePayload.endLocalIso,
              newStart: extractedUpdateDetails.newStart,
              newEnd: extractedUpdateDetails.newEnd,
            });

          if (mergedTimeOnlyUpdate) {
            resolvedUpdatedStart = mergedTimeOnlyUpdate.start;
            resolvedUpdatedEnd = mergedTimeOnlyUpdate.end;
          }
        }

        try {
          const updatedCalendarEvent =
            await this.calendarService.updateEvent({
              sessionId,
              calendarId: pendingUpdatePayload.calendarId,
              eventId: pendingUpdatePayload.eventId,
              timeZone: pendingUpdatePayload.timeZone,
              title:
                extractedUpdateDetails.newTitle ?? undefined,
              start: resolvedUpdatedStart,
              end: resolvedUpdatedEnd,
            });

          this.pendingRequestService.clearPending(
            sessionId,
            'calendar_update',
          );

          return (
            `Done — I updated **${updatedCalendarEvent.title}** ` +
            'in your Google Calendar.' +
            (updatedCalendarEvent.url
              ? `\n\nOpen in Calendar: ${updatedCalendarEvent.url}`
              : '')
          );
        } catch (error: unknown) {
          return formatToolFailureMessage(
            'update the calendar event',
            error,
          );
        }
      }

      /*
       * PICK PHASE
       *
       * More than one event was found. The current reply should only select
       * an event. The actual requested changes must come from the saved pending
       * request, not from the current reply such as "1".
       */
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
        const lowerMsg = message.toLowerCase().trim();
        const matchedByTitle = pendingUpdatePayload.options.filter((opt) => {
          const titleLower = opt.title.toLowerCase();
          return lowerMsg.includes(titleLower) || titleLower.includes(lowerMsg);
        });

        if (matchedByTitle.length === 1) {
          selectedCalendarEvent = matchedByTitle[0];
        }
      }

      if (!selectedCalendarEvent) {
        return (
          `Reply with a number 1–${pendingUpdatePayload.options.length} ` +
          'for the event to update, or say cancel.'
        );
      }

      /*
       * Prefer the changes already saved when the pending selection was created.
       */
      let savedNewTitle =
        pendingUpdatePayload.newTitle ?? null;

      let savedNewStart =
        pendingUpdatePayload.newStart ?? null;

      let savedNewEnd =
        pendingUpdatePayload.newEnd ?? null;

      /*
       * If update details are missing, try extracting them from the CURRENT
       * selection turn first (e.g. "move option 1 to 4pm"), then fallback to original message.
       */
      if (!savedNewTitle && !savedNewStart && !savedNewEnd) {
        const extractedTurnUpdate =
          await extractCalendarMutationArgs(
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
        } else {
          const reExtractedOriginalUpdate =
            await extractCalendarMutationArgs(
              this.llmService,
              pendingUpdate.originalMessage,
              pendingUpdatePayload.timeZone,
            );

          if (
            reExtractedOriginalUpdate?.operation === 'update'
          ) {
            savedNewTitle =
              reExtractedOriginalUpdate.newTitle ?? null;

            savedNewStart =
              reExtractedOriginalUpdate.newStart ?? null;

            savedNewEnd =
              reExtractedOriginalUpdate.newEnd ?? null;
          }
        }
      }

      const updateDetailsAreStillMissing =
        !savedNewTitle &&
        !savedNewStart &&
        !savedNewEnd;

      /*
       * The selected event is now known, but we still do not know what should
       * change. Move into the details phase while preserving the event target.
       */
      if (updateDetailsAreStillMissing) {
        this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
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
              startLocalIso:
                selectedCalendarEvent.startLocalIso,
              endLocalIso:
                selectedCalendarEvent.endLocalIso,
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

      let resolvedUpdatedStart =
        savedNewStart ?? undefined;

      let resolvedUpdatedEnd =
        savedNewEnd ?? undefined;

      if (
        selectedCalendarEvent.startLocalIso &&
        (resolvedUpdatedStart || resolvedUpdatedEnd)
      ) {
        const mergedTimeOnlyUpdate =
          mergeTimeOnlyUpdateOntoEventDay({
            /*
             * Use the original request here because that contains "move it to
             * 4pm". Using the current message would pass only "1".
             */
            userMessage: pendingUpdate.originalMessage,
            timeZone: pendingUpdatePayload.timeZone,
            eventStartLocalIso:
              selectedCalendarEvent.startLocalIso,
            eventEndLocalIso:
              selectedCalendarEvent.endLocalIso,
            newStart: savedNewStart,
            newEnd: savedNewEnd,
          });

        if (mergedTimeOnlyUpdate) {
          resolvedUpdatedStart =
            mergedTimeOnlyUpdate.start;

          resolvedUpdatedEnd =
            mergedTimeOnlyUpdate.end;
        }
      }


      try {
        const updatedCalendarEvent =
          await this.calendarService.updateEvent({
            sessionId,
            calendarId:
              selectedCalendarEvent.calendarId,
            eventId: selectedCalendarEvent.eventId,
            timeZone: pendingUpdatePayload.timeZone,
            title: savedNewTitle ?? undefined,
            start: resolvedUpdatedStart,
            end: resolvedUpdatedEnd,
          });

        this.pendingRequestService.clearPending(
          sessionId,
          'calendar_update',
        );

        return (
          `Done — I updated **${updatedCalendarEvent.title}** ` +
          'in your Google Calendar.' +
          (updatedCalendarEvent.url
            ? `\n\nOpen in Calendar: ${updatedCalendarEvent.url}`
            : '')
        );
      } catch (error: unknown) {
        return formatToolFailureMessage(
          'update the calendar event',
          error,
        );
      }
    }

    const tzCandidate = getSlotTimeZone(envelope);
    if (envelope?.intent === 'set_timezone' && tzCandidate) {
      try {
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate);
      } catch (e: unknown) {
        return formatToolFailureMessage('set timezone', e);
      }

      const pending = this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );
      if (pending) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_create');
        return this.calendarCreateHandler.completeCreateAfterTimezone(
          sessionId,
          tzCandidate,
          pending.payload.message,
        );
      }

      const pendingList = this.pendingRequestService.getPending<PendingCalendarListPayload>(
        sessionId,
        'calendar_list',
      );
      if (pendingList) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_list');
        return this.calendarListHandler.completeListAfterTimezone(
          sessionId,
          tzCandidate,
          pendingList.payload,
        );
      }

      const pendingMutTz =
        this.pendingRequestService.getPending<PendingCalendarMutateTzPayload>(
          sessionId,
          'calendar_mutate_tz',
        );

      if (pendingMutTz) {
        this.pendingRequestService.clearPending(
          sessionId,
          'calendar_mutate_tz',
        );

        return this.calendarMutationHandler.runCalendarMutation({
          sessionId,
          userMessage: pendingMutTz.payload.message,
          timeZone: tzCandidate,
          envelope,
        });
      }

      return `Got it — I’ll schedule events in ${tzCandidate}.`;
    }

    return null;
  }
}
