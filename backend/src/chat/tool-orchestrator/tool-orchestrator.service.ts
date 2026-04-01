import { Injectable } from '@nestjs/common';
import { CalendarToolHandler } from './calendar-tool.handler';
import { EmailToolHandler } from './email-tool.handler';
import { ToolPendingFlowService } from './tool-pending-flow.service';
import type { IntentEnvelope } from '../intent/intent.types';

/**
 * Facade for chat tool actions. Delegates to:
 * - {@link CalendarToolHandler} — list/create/update/delete via Google Calendar + LLM extractors
 * - {@link EmailToolHandler} — Gmail drafts, send, revise while pending
 * - {@link ToolPendingFlowService} — multi-turn pending state and `set_timezone` resumes
 *
 * ChatService calls these methods directly for LLM-routed intents; `tryHandle` covers everything else.
 */
@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly calendarTools: CalendarToolHandler,
    private readonly emailTools: EmailToolHandler,
    private readonly pendingFlow: ToolPendingFlowService,
  ) {}

  handleCalendarListIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.calendarTools.handleCalendarListIntent(
      sessionId,
      message,
      envelope,
    );
  }

  handleCalendarCreateIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.calendarTools.handleCalendarCreateIntent(
      sessionId,
      message,
      envelope,
    );
  }

  handleCalendarMutationIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.calendarTools.handleCalendarMutationIntent(
      sessionId,
      message,
      envelope,
    );
  }

  handleEmailDraftIntent(sessionId: string, message: string): Promise<string> {
    return this.emailTools.handleEmailDraftIntent(sessionId, message);
  }

  handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    return this.emailTools.handlePendingEmailSendTurn(
      sessionId,
      message,
      envelope,
    );
  }

  tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<string | null> {
    return this.emailTools.tryLlmRoutedEmail(sessionId, message, envelope);
  }

  tryHandle(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    return this.pendingFlow.tryHandle(sessionId, message, envelope);
  }
}
