import { Injectable } from '@nestjs/common';
import { CalendarListHandler } from './calendar/calendar-list.handler';
import { CalendarCreateHandler } from './calendar/calendar-create.handler';
import { CalendarMutationHandler } from './calendar/calendar-mutation.handler';
import { EmailToolHandler } from './email/email-tool.handler';
import { WebSearchToolHandler } from './web-search/web-search-tool.handler';
import { ToolPendingFlowService } from './tool-pending-flow.service';
import type { IntentEnvelope } from '../intent/intent.types';

/**
 * Facade for chat tool actions. Delegates to:
 * - CalendarHandlers — list/create/update/delete via Google Calendar + LLM extractors
 * - {@link EmailToolHandler} — Gmail drafts, send, revise while pending
 * - {@link ToolPendingFlowService} — multi-turn pending state and `set_timezone` resumes
 *
 * ChatService calls these methods directly for LLM-routed intents; `tryHandle` covers everything else.
 */
@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly calendarListHandler: CalendarListHandler,
    private readonly calendarCreateHandler: CalendarCreateHandler,
    private readonly calendarMutationHandler: CalendarMutationHandler,
    private readonly emailTools: EmailToolHandler,
    private readonly webSearchTools: WebSearchToolHandler,
    private readonly pendingFlow: ToolPendingFlowService,
  ) { }

  handleCalendarListIntent(
    sessionId: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.calendarListHandler.handleCalendarListIntent(
      sessionId,
      envelope,
    );
  }

  handleCalendarCreateIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.calendarCreateHandler.handleCalendarCreateIntent(
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
    return this.calendarMutationHandler.handleCalendarMutationIntent(
      sessionId,
      message,
      envelope,
    );
  }

  handleEmailDraftIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.emailTools.handleEmailDraftIntent(sessionId, message, envelope);
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

  handleWebSearchIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    return this.webSearchTools.handleWebSearchIntent(sessionId, message, envelope);
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
