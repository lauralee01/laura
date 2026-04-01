import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../integrations/calendar/calendar.service';
import { SessionPreferencesService } from '../session-preferences.service';
import { PendingRequestService } from '../pending-request.service';
import { CalendarToolHandler } from './calendar-tool.handler';
import { EmailToolHandler } from './email-tool.handler';
import { mergeTimeOnlyUpdateOntoEventDay } from './tool-orchestrator.calendar-update-merge';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
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
    private readonly calendarTools: CalendarToolHandler,
    private readonly emailTools: EmailToolHandler,
  ) {}

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
          await this.calendarTools['calendarService']?.deleteEvent?.(
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
        this.pendingRequestService.clearPending(sessionId, 'calendar_update');
        return (
          'Okay — I won’t change that event. Ask again when you want to reschedule or rename something.'
        );
      }
      const pu = pendingUpdate.payload;
      const idx = getSlotSelectedIndex(envelope, pu.options.length);
      if (idx === null) {
        return (
          `Reply with a number 1–${pu.options.length} for the event to update, or say cancel.`
        );
      }
      const opt = pu.options[idx - 1];
      this.pendingRequestService.clearPending(sessionId, 'calendar_update');
      try {
        let startU = pu.newStart ?? undefined;
        let endU = pu.newEnd ?? undefined;
        if (opt.startLocalIso && (startU || endU)) {
          const merged = mergeTimeOnlyUpdateOntoEventDay({
            userMessage: pendingUpdate.originalMessage,
            timeZone: pu.timeZone,
            eventStartLocalIso: opt.startLocalIso,
            eventEndLocalIso: opt.endLocalIso,
            newStart: pu.newStart,
            newEnd: pu.newEnd,
          });
          if (merged) {
            startU = merged.start;
            endU = merged.end;
          }
        }
        const updated = await this.calendarService.updateEvent({
          sessionId,
          calendarId: opt.calendarId,
          eventId: opt.eventId,
          timeZone: pu.timeZone,
          title: pu.newTitle ?? undefined,
          start: startU,
          end: endU,
        });
        return (
          `Updated in Google Calendar: “${updated.title}”.\n` +
          (updated.url ? `Open: ${updated.url}\n` : '') +
          `(event id: ${updated.eventId})`
        );
      } catch (e: unknown) {
        return formatToolFailureMessage('update the calendar event', e);
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
        return this.calendarTools.completeCreateAfterTimezone(
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
        return this.calendarTools.completeListAfterTimezone(
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
        return this.calendarTools.runCalendarMutation(
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
