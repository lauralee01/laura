import { Injectable } from '@nestjs/common';
import type { ToolReplyInput } from '../action-receipt.types';
import { MorningBriefingHandler } from './briefing/morning-briefing.handler';
import { CalendarListHandler } from './calendar/calendar-list.handler';
import { CalendarCreateHandler } from './calendar/calendar-create.handler';
import { CalendarMutationHandler } from './calendar/calendar-mutation.handler';
import { EmailToolHandler } from './email/email-tool.handler';
import { WebSearchToolHandler } from './web-search/web-search-tool.handler';
import type {
  WebSearchSessionContext,
  WebSearchToolResult,
} from './web-search/web-search-tool.types';
import { ToolPendingFlowService } from './tool-pending-flow.service';
import type { IntentEnvelope } from '../intent/intent.types';

/**
 * Facade for chat tool actions. Delegates to:
 * - CalendarHandlers — list/create/update/delete via Google Calendar + LLM extractors
 * - {@link EmailToolHandler} — Gmail drafts, send, revise while pending
 * - {@link MorningBriefingHandler} — composed today calendar + optional weather
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
    private readonly morningBriefingHandler: MorningBriefingHandler,
    private readonly pendingFlow: ToolPendingFlowService,
  ) { }

  handleMorningBriefingIntent(
    sessionId: string,
    sessionTz: string | null,
    storedLocation: string | null,
  ): Promise<string> {
    return this.morningBriefingHandler.handleMorningBriefing(
      sessionId,
      sessionTz,
      storedLocation,
    );
  }

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
  ): Promise<ToolReplyInput> {
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
  ): Promise<ToolReplyInput> {
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
  ): Promise<ToolReplyInput> {
    return this.emailTools.handleEmailDraftIntent(sessionId, message, envelope);
  }

  handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    return this.emailTools.handlePendingEmailSendTurn(
      sessionId,
      message,
      envelope,
    );
  }

  handleEmailDraftFollowUp(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    return this.emailTools.handleEmailDraftFollowUp(
      sessionId,
      message,
      envelope,
    );
  }

  handleWebSearchIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
    onChunk?: (chunk: string) => void,
    sessionContext?: WebSearchSessionContext,
  ): Promise<WebSearchToolResult> {
    return this.webSearchTools.handleWebSearchIntent(
      sessionId,
      message,
      envelope,
      onChunk,
      sessionContext,
    );
  }

  tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    return this.emailTools.tryLlmRoutedEmail(sessionId, message, envelope);
  }

  tryHandle(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    return this.pendingFlow.tryHandle(sessionId, message, envelope);
  }
}
