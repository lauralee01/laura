import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { ToolOrchestratorService } from './tool-orchestrator';
import { MemoryPersistenceService } from './memory-persistence.service';
import { ChatHistoryService } from './chat-history.service';
import { PendingRequestService } from './pending-request.service';
import { SessionPreferencesService } from './session-preferences.service';
import {
  buildPendingHintForClassifier,
  IntentShadowService,
  IntentRouterService,
  type IntentEnvelope,
} from './intent';

type ChatReply = {
  reply: string;
  conversationId?: string;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly llmService: LlmService,
    private readonly memoryService: MemoryService,
    private readonly toolOrchestrator: ToolOrchestratorService,
    private readonly memoryPersistenceService: MemoryPersistenceService,
    private readonly chatHistoryService: ChatHistoryService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly intentShadowService: IntentShadowService,
    private readonly intentRouter: IntentRouterService,
  ) { }

  private getLastAssistantTurn(history?: LlmChatTurn[]): LlmChatTurn | undefined {
    if (!history) return undefined;

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') return history[i];
    }

    return undefined;
  }

  private isLikelyFollowUpAnswer(message: string, history?: LlmChatTurn[]): boolean {
    const lastAssistantTurn = this.getLastAssistantTurn(history);
    if (!lastAssistantTurn) return false;

    const cleanMessage = message.trim();
    const wordCount = cleanMessage.split(/\s+/).filter(Boolean).length;

    const userReplyLooksShort = cleanMessage.length <= 160 && wordCount <= 25;

    const assistantAskedQuestion =
      /\?|what location|which location|where|when|what time|which day|what kind|which one|who is it for|are you looking for|do you mean|can you clarify|can you confirm/i.test(
        lastAssistantTurn.content,
      );

    return assistantAskedQuestion && userReplyLooksShort;
  }

  async replyTo(
    sessionId: string,
    message: string,
    history?: LlmChatTurn[],
    conversationId?: string,
  ): Promise<ChatReply> {
    const dbConversationId = await this.chatHistoryService.ensureConversation(
      sessionId,
      conversationId,
    );
    await this.chatHistoryService.appendMessage(
      dbConversationId ?? '',
      'user',
      message,
    );

    let priorTurns: LlmChatTurn[] | undefined = history;
    if (!priorTurns && dbConversationId) {
      const turns =
        await this.chatHistoryService.listTurnsForLlm(dbConversationId);
      priorTurns = turns.slice(0, Math.max(0, turns.length - 1));
    }

    const pendingHint = buildPendingHintForClassifier(
      sessionId,
      this.pendingRequestService,
    );
    const sessionTz =
      await this.sessionPreferences.getTimeZone(sessionId);

    let precomputedEnvelope: IntentEnvelope | undefined;
    let routingClassifyFailed = false;

    try {
      precomputedEnvelope = await this.intentRouter.classify({
        userMessage: message,
        pendingHint,
        sessionTimeZone: sessionTz ?? undefined,
        history: priorTurns,
      });
    } catch {
      routingClassifyFailed = true;
      precomputedEnvelope = undefined;
    }

    const envelope = precomputedEnvelope;
    const minToolConfidence =
      this.intentRouter.getToolRoutingMinConfidence();
    const isLowConfidenceIntent =
      !!envelope && envelope.confidence < minToolConfidence;
    const isChatLikeIntent =
      envelope?.intent === 'general_chat' ||
      envelope?.intent === 'clarify' ||
      isLowConfidenceIntent;

    const shadowLog = (e?: IntentEnvelope) => ({
      sessionId,
      message,
      pendingHint,
      sessionTimeZone: sessionTz ?? undefined,
      precomputedEnvelope: e,
      skipDuplicateClassify: routingClassifyFailed,
    });

    const shouldClearPendingEmailFromEnvelope =
      envelope?.intent === 'calendar_list' ||
      envelope?.intent === 'calendar_create' ||
      envelope?.intent === 'calendar_update' ||
      envelope?.intent === 'calendar_delete' ||
      envelope?.intent === 'email_draft';
    if (this.pendingRequestService.getPending(sessionId, 'email_send') && shouldClearPendingEmailFromEnvelope) {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
    }

    if (this.pendingRequestService.getPending(sessionId, 'email_send')) {
      if (envelope) {
        const emailLlm = await this.toolOrchestrator.tryLlmRoutedEmail(
          sessionId,
          message,
          envelope,
        );
        if (emailLlm !== null) {
          await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
          await this.chatHistoryService.appendMessage(
            dbConversationId ?? '',
            'assistant',
            emailLlm,
          );
          await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
            sessionId,
            message,
          );
          return {
            reply: emailLlm,
            conversationId: dbConversationId ?? undefined,
          };
        }
      }
      const emailRegex = await this.toolOrchestrator.handlePendingEmailSendTurn(
        sessionId,
        message,
        envelope,
      );
      if (emailRegex !== null) {
        await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
        await this.chatHistoryService.appendMessage(
          dbConversationId ?? '',
          'assistant',
          emailRegex,
        );
        await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
          sessionId,
          message,
        );
        return {
          reply: emailRegex,
          conversationId: dbConversationId ?? undefined,
        };
      }
    }

    if (envelope?.intent === 'current_datetime') {
      const timeZone = sessionTz ?? 'America/Chicago';

      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date());

      const reply = `The current date and time in ${timeZone} is ${formatted}.`;

      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));

      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        reply,
      );

      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );

      return {
        reply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    if (envelope?.intent === 'calendar_list') {
      const listReply =
        await this.toolOrchestrator.handleCalendarListIntent(
          sessionId,
          message,
          envelope,
        );
      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        listReply,
      );
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: listReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    if (envelope?.intent === 'calendar_create') {
      const createReply =
        await this.toolOrchestrator.handleCalendarCreateIntent(
          sessionId,
          message,
          envelope,
        );
      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        createReply,
      );
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: createReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    if (
      envelope &&
      (envelope.intent === 'calendar_update' ||
        envelope.intent === 'calendar_delete')
    ) {
      const mutReply =
        await this.toolOrchestrator.handleCalendarMutationIntent(
          sessionId,
          message,
          envelope,
        );
      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        mutReply,
      );
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: mutReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    if (envelope?.intent === 'email_draft' && !this.pendingRequestService.getPending(sessionId, 'email_send')) {
      const draftReply = await this.toolOrchestrator.handleEmailDraftIntent(
        sessionId,
        message,
        envelope,
      );
      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        draftReply,
      );
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: draftReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    const shouldTreatAsFollowUpAnswer =
      envelope?.intent === 'clarify' &&
      this.isLikelyFollowUpAnswer(message, priorTurns);

    if (envelope && (envelope.intent === 'clarify' || isLowConfidenceIntent) && !shouldTreatAsFollowUpAnswer) {
      const clarifyReply =
        'I did not fully catch that. Could you rephrase what you want me to do? ';

      await this.intentShadowService.maybeLogLlmIntent(shadowLog(envelope));
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        clarifyReply,
      );

      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: clarifyReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    const toolReply = isChatLikeIntent
      ? null
      : await this.toolOrchestrator.tryHandle(sessionId, message, envelope);

    await this.intentShadowService.maybeLogLlmIntent(shadowLog(precomputedEnvelope));
    if (toolReply) {
      await this.chatHistoryService.appendMessage(
        dbConversationId ?? '',
        'assistant',
        toolReply,
      );
      // Keep implicit memory write even for tool paths.
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message,
      );
      return {
        reply: toolReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    // Phase 1 MVP: single-turn chat with retrieved memory (if sessionId is present).
    const systemBasePrompt =
      'You are laura, a helpful personalized AI assistant designed to help users plan their day, organize tasks, manage information, and make everyday life easier. ' +
      'Be concise, practical, and conversational. Follow the user’s intent and ask clarifying questions only when needed. ' +
      'If you ask the user a follow-up question, treat their next short reply as an answer to that question when it clearly fits the context. ' +
      'Important: Never claim you created, updated, sent, deleted, or scheduled anything in external tools unless the server explicitly confirms it through a tool response. ' +
      'If the user asks to do something that requires an integration and it has not run yet, ask for the missing info or explain what you need next. ' +
      'You do not currently have access to a web browser, search engine, weather API, stock data, news, or other real-time data sources. ' +
      'For real-time requests, explain that you cannot fetch live data yet and offer general help or suggest what information the user can provide.';

    let systemPrompt = systemBasePrompt;

    // If we have a sessionId, retrieve relevant memory and provide it to the model.
    if (sessionId) {
      const memories = await this.memoryService.searchMemories({
        userId: sessionId,
        query: message,
        topK: 3,
      });

      if (memories.length > 0) {
        const memoryContext = memories.map((m) => `- ${m.content}`).join('\n');

        systemPrompt =
          systemBasePrompt +
          '\n\nUser session preferences / facts (use as hard constraints):\n' +
          memoryContext +
          '\n\nWhen generating your reply, follow these constraints exactly. ' +
          'If a requested detail conflicts with a constraint, ask a clarifying question.';
      } else {
        systemPrompt =
          systemBasePrompt +
          '\n\nNo relevant memories found for this session. Proceed normally.';
      }
    }

    // Phase 1 (user-visible): generate the reply using retrieved memory context.

    const reply = await this.llmService.generate({
      systemPrompt,
      userMessage: message,
      history: priorTurns,
    });
    await this.chatHistoryService.appendMessage(
      dbConversationId ?? '',
      'assistant',
      reply,
    );

    await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
      sessionId,
      message,
    );

    return { reply, conversationId: dbConversationId ?? undefined };
  }
}
