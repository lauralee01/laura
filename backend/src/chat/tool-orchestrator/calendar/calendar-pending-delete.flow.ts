import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../../integrations/calendar/calendar.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import { PendingRequestService } from '../../pending-request.service';
import type { PendingRequest } from '../../pending-request.service';
import { getSlotSelectedIndex } from '../tool-orchestrator.intent-slots';
import type { PendingCalendarDeletePayload } from '../tool-orchestrator.types';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { pickUniqueTitleMatch } from './calendar-event-pick';

@Injectable()
export class CalendarPendingDeleteFlow {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly pendingRequestService: PendingRequestService,
  ) { }

  async handle(
    sessionId: string,
    message: string,
    pendingDelete: PendingRequest<PendingCalendarDeletePayload>,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    if (envelope?.intent === 'pending_cancel') {
      await this.pendingRequestService.clearPending(
        sessionId,
        'calendar_delete',
      );
      return (
        'Okay — I won’t delete anything. Ask again when you want to remove an event.'
      );
    }

    const p = pendingDelete.payload;
    if (p.phase === 'pick') {
      const idx = getSlotSelectedIndex(envelope, p.options.length);
      let opt =
        idx !== null && idx >= 1 && idx <= p.options.length
          ? p.options[idx - 1]
          : undefined;

      if (!opt) {
        opt = pickUniqueTitleMatch(message, p.options) ?? undefined;
      }

      if (!opt) {
        return (
          `Reply with a number 1–${p.options.length} for the event to delete, or say cancel.`
        );
      }

      await this.pendingRequestService.setPending<PendingCalendarDeletePayload>(
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
        await this.pendingRequestService.clearPending(
          sessionId,
          'calendar_delete',
        );
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
}
