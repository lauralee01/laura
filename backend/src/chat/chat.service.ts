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
import { shouldClearEmailSendForNewToolIntent } from './tool-orchestrator/tool-orchestrator.email-send-intents';

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
  ) {}

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

    const pendingHint = buildPendingHintForClassifier(
      sessionId,
      this.pendingRequestService,
    );
    const sessionTz =
      await this.sessionPreferences.getTimeZone(sessionId);

    let precomputedEnvelope: IntentEnvelope | undefined;
    let routingClassifyFailed = false;

    if (this.intentRouter.isLlmToolRoutingEnabled()) {
      try {
        precomputedEnvelope = await this.intentRouter.classify({
          userMessage: message,
          pendingHint,
          sessionTimeZone: sessionTz ?? undefined,
        });
      } catch {
        routingClassifyFailed = true;
        precomputedEnvelope = undefined;
      }
    }

    const envelope = precomputedEnvelope;

    const shadowLog = (e?: IntentEnvelope) => ({
      sessionId,
      message,
      pendingHint,
      sessionTimeZone: sessionTz ?? undefined,
      precomputedEnvelope: e,
      skipDuplicateClassify: routingClassifyFailed,
    });

    if (
      this.pendingRequestService.getPending(sessionId, 'email_send') &&
      shouldClearEmailSendForNewToolIntent(message)
    ) {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
    }

    if (this.pendingRequestService.getPending(sessionId, 'email_send')) {
      if (this.intentRouter.isEmailLlmRoutingEnabled() && envelope) {
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

    if (this.intentRouter.isCalendarLlmRoutingEnabled() && envelope) {
      const routeList = this.intentRouter.isCalendarListLlmRoutingEnabled();
      const routeMut =
        this.intentRouter.isCalendarMutationsLlmRoutingEnabled();

      if (routeList && envelope.intent === 'calendar_list') {
          const listReply =
            await this.toolOrchestrator.handleCalendarListIntent(
              sessionId,
              message,
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

        if (routeMut && envelope.intent === 'calendar_create') {
          const createReply =
            await this.toolOrchestrator.handleCalendarCreateIntent(
              sessionId,
              message,
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
          routeMut &&
          (envelope.intent === 'calendar_update' ||
            envelope.intent === 'calendar_delete')
        ) {
          const mutReply =
            await this.toolOrchestrator.handleCalendarMutationIntent(
              sessionId,
              message,
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
    }

    if (
      this.intentRouter.isEmailLlmRoutingEnabled() &&
      envelope?.intent === 'email_draft' &&
      !this.pendingRequestService.getPending(sessionId, 'email_send')
    ) {
      const draftReply = await this.toolOrchestrator.handleEmailDraftIntent(
        sessionId,
        message,
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

    const toolReply = await this.toolOrchestrator.tryHandle(sessionId, message);

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
      'You are laura, a helpful personalized AI agent. ' +
      'Be concise, ask clarifying questions when needed, and follow the user’s intent. ' +
      'Important: Never claim you created/updated external resources (Gmail drafts, Google Calendar events, etc.) unless the server explicitly confirms it via a tool response. ' +
      'If the user asks to do something that requires an integration and it has not run yet, ask for the missing info or explain what you need next.';

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
    let priorTurns: LlmChatTurn[] | undefined = history;
    if (!priorTurns && dbConversationId) {
      const turns =
        await this.chatHistoryService.listTurnsForLlm(dbConversationId);
      priorTurns = turns.slice(0, Math.max(0, turns.length - 1));
    }

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
