import { Injectable } from '@nestjs/common';
import type { IntentEnvelope } from '../../intent/intent.types';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import { getSlotTimeZone } from '../tool-orchestrator.intent-slots';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarListPayload,
  PendingCalendarMutateTzPayload,
} from '../tool-orchestrator.types';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { CalendarCreateHandler } from './calendar-create.handler';
import { CalendarListHandler } from './calendar-list.handler';
import { CalendarMutationHandler } from './calendar-mutation.handler';

@Injectable()
export class CalendarPendingTimezoneFlow {
  constructor(
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly calendarListHandler: CalendarListHandler,
    private readonly calendarCreateHandler: CalendarCreateHandler,
    private readonly calendarMutationHandler: CalendarMutationHandler,
  ) { }

  async handle(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    const tzCandidate = getSlotTimeZone(envelope);
    if (envelope?.intent !== 'set_timezone' || !tzCandidate) {
      return null;
    }

    try {
      await this.sessionPreferences.setTimeZone(sessionId, tzCandidate);
    } catch (e: unknown) {
      return formatToolFailureMessage('set timezone', e);
    }

    const pending =
      await this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );
    if (pending) {
      await this.pendingRequestService.clearPending(
        sessionId,
        'calendar_create',
      );
      return this.calendarCreateHandler.completeCreateAfterTimezone(
        sessionId,
        tzCandidate,
        pending.payload.message,
      );
    }

    const pendingList =
      await this.pendingRequestService.getPending<PendingCalendarListPayload>(
        sessionId,
        'calendar_list',
      );
    if (pendingList) {
      await this.pendingRequestService.clearPending(
        sessionId,
        'calendar_list',
      );
      return this.calendarListHandler.completeListAfterTimezone(
        sessionId,
        tzCandidate,
        pendingList.payload,
      );
    }

    const pendingMutTz =
      await this.pendingRequestService.getPending<PendingCalendarMutateTzPayload>(
        sessionId,
        'calendar_mutate_tz',
      );

    if (pendingMutTz) {
      await this.pendingRequestService.clearPending(
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
}
