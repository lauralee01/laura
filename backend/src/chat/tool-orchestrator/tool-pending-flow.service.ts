import { Injectable } from '@nestjs/common';
import type { ToolReplyInput } from '../action-receipt.types';
import { PendingRequestService } from '../pending-request.service';
import { CalendarCreateHandler } from './calendar/calendar-create.handler';
import { CalendarPendingDeleteFlow } from './calendar/calendar-pending-delete.flow';
import { CalendarPendingTimezoneFlow } from './calendar/calendar-pending-timezone.flow';
import { CalendarPendingUpdateFlow } from './calendar/calendar-pending-update.flow';
import { EmailToolHandler } from './email/email-tool.handler';
import type {
  PendingCalendarCreatePayload,
  PendingCalendarDeletePayload,
  PendingCalendarUpdatePayload,
} from './tool-orchestrator.types';
import type { IntentEnvelope } from '../intent/intent.types';

/**
 * Multi-turn pending routes: email send first, then calendar create/delete/update,
 * then set_timezone resumes. ChatService prefers Stage-1; this is the fallback.
 */
@Injectable()
export class ToolPendingFlowService {
  constructor(
    private readonly pendingRequestService: PendingRequestService,
    private readonly calendarCreateHandler: CalendarCreateHandler,
    private readonly calendarPendingDelete: CalendarPendingDeleteFlow,
    private readonly calendarPendingUpdate: CalendarPendingUpdateFlow,
    private readonly calendarPendingTimezone: CalendarPendingTimezoneFlow,
    private readonly emailTools: EmailToolHandler,
  ) { }

  async tryHandle(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    const pendingEmail = await this.emailTools.handlePendingEmailSendTurn(
      sessionId,
      message,
      envelope,
    );
    if (pendingEmail !== null) return pendingEmail;

    const pendingCreate =
      await this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );

    if (pendingCreate && envelope?.intent !== 'set_timezone') {
      if (envelope?.intent === 'pending_cancel') {
        await this.pendingRequestService.clearPending(
          sessionId,
          'calendar_create',
        );
        return 'No problem — I won’t add that to your calendar.';
      }

      return this.calendarCreateHandler.handleCalendarCreateIntent(
        sessionId,
        message,
        envelope,
      );
    }

    const pendingDelete =
      await this.pendingRequestService.getPending<PendingCalendarDeletePayload>(
        sessionId,
        'calendar_delete',
      );
    if (pendingDelete) {
      return this.calendarPendingDelete.handle(
        sessionId,
        message,
        pendingDelete,
        envelope,
      );
    }

    const pendingUpdate =
      await this.pendingRequestService.getPending<PendingCalendarUpdatePayload>(
        sessionId,
        'calendar_update',
      );
    if (pendingUpdate) {
      return this.calendarPendingUpdate.handle(
        sessionId,
        message,
        pendingUpdate,
        envelope,
      );
    }

    return this.calendarPendingTimezone.handle(sessionId, envelope);
  }
}
