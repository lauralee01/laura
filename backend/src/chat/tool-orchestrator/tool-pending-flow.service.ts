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
        if (idx === null) {
          return (
            `Reply with a number 1–${p.options.length} for the event to delete, or say cancel.`
          );
        }
        const opt = p.options[idx - 1];
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
      const pu = pendingUpdate.payload;

      if (pu.phase === 'details') {
        const extracted = await extractCalendarMutationArgs(
          this.llmService,
          message,
          pu.timeZone,
        );

        if (
          !extracted ||
          extracted.operation !== 'update' ||
          (!extracted.newTitle && !extracted.newStart && !extracted.newEnd)
        ) {
          return (
            `What should I change for **${pu.title}**—the title, time, or both?\n\n` +
            `For example: “rename it to Budget review” or “move it to 4pm”.`
          );
        }

        let start = extracted.newStart ?? undefined;
        let end = extracted.newEnd ?? undefined;

        if (pu.startLocalIso && (start || end)) {
          const merged = mergeTimeOnlyUpdateOntoEventDay({
            userMessage: message,
            timeZone: pu.timeZone,
            eventStartLocalIso: pu.startLocalIso,
            eventEndLocalIso: pu.endLocalIso,
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
          calendarId: pu.calendarId,
          eventId: pu.eventId,
          timeZone: pu.timeZone,
          title: extracted.newTitle ?? undefined,
          start,
          end,
        });

        this.pendingRequestService.clearPending(
          sessionId,
          'calendar_update',
        );

        return (
          `Done — I updated **${updated.title}** in your Google Calendar.` +
          (updated.url ? `\n\nOpen in Calendar: ${updated.url}` : '')
        );
      }

      // From here onward, TypeScript knows pu.phase === 'pick'.
      const idx = getSlotSelectedIndex(envelope, pu.options.length);

      if (!idx) {
        return (
          `Reply with a number 1–${pu.options.length} for the event to update, ` +
          `or say cancel.`
        );
      }

      const opt = pu.options[idx - 1];

      if (!opt) {
        return (
          `Reply with a number 1–${pu.options.length} for the event to update, ` +
          `or say cancel.`
        );
      }

      const updateDetailsMissing =
        !pu.newTitle && !pu.newStart && !pu.newEnd;

      if (updateDetailsMissing) {
        this.pendingRequestService.setPending<PendingCalendarUpdatePayload>(
          sessionId,
          {
            actionType: 'calendar_update',
            originalMessage: pendingUpdate.originalMessage,
            payload: {
              phase: 'details',
              timeZone: pu.timeZone,
              eventId: opt.eventId,
              calendarId: opt.calendarId,
              title: opt.title,
              startText: opt.startText,
              startLocalIso: opt.startLocalIso,
              endLocalIso: opt.endLocalIso,
            },
            missingSlots: ['updateDetails'],
            collectedSlots: {},
          },
        );

        return (
          `I found **${opt.title}** scheduled for ${opt.startText}.\n\n` +
          `What should I change—the title, time, or both?`
        );
      }

      let start = pu.newStart ?? undefined;
      let end = pu.newEnd ?? undefined;

      if (opt.startLocalIso && (start || end)) {
        const merged = mergeTimeOnlyUpdateOntoEventDay({
          userMessage: pendingUpdate.originalMessage,
          timeZone: pu.timeZone,
          eventStartLocalIso: opt.startLocalIso,
          eventEndLocalIso: opt.endLocalIso,
          newStart: pu.newStart,
          newEnd: pu.newEnd,
        });

        if (merged) {
          start = merged.start;
          end = merged.end;
        }
      }

      const updated = await this.calendarService.updateEvent({
        sessionId,
        calendarId: opt.calendarId,
        eventId: opt.eventId,
        timeZone: pu.timeZone,
        title: pu.newTitle ?? undefined,
        start,
        end,
      });

      this.pendingRequestService.clearPending(
        sessionId,
        'calendar_update',
      );

      return (
        `Done — I updated **${updated.title}** in your Google Calendar.` +
        (updated.url ? `\n\nOpen in Calendar: ${updated.url}` : '')
      );
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
        this.pendingRequestService.clearPending(sessionId, 'calendar_mutate_tz');
        return this.calendarMutationHandler.runCalendarMutation(
          sessionId,
          pendingMutTz.payload.message,
          tzCandidate,
        );
      }

      return `Got it — I’ll schedule events in ${tzCandidate}.`;
    }

    return null;
  }
}
