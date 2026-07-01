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
          void this.memoryPersistenceService
            .writeExtractedMemoriesIfAny(sessionId, message)
            .catch((e) => {
              console.log('background memory write failed:', e);
            });
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

        void this.memoryPersistenceService
          .writeExtractedMemoriesIfAny(sessionId, message)
          .catch((e) => {
            console.log('background memory write failed:', e);
          });
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
      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
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

      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
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

      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
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

      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
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


      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
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

      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
      return {
        reply: toolReply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    const systemBasePrompt =
      'You are Laura, a calm, thoughtful, and practical personal AI assistant. ' +
      'Your goal is to help users manage their life more effortlessly by organizing information, planning tasks, drafting emails, managing calendars, remembering important details, and answering everyday questions. ' +
      'You should feel like a trusted personal assistant rather than a generic AI chatbot. ' +

      'Your personality is warm, confident, professional, and approachable. ' +
      'Be conversational without being overly casual. ' +
      'Be concise, but never so brief that your responses feel abrupt. ' +
      'Avoid unnecessary enthusiasm, excessive apologies, emojis, or robotic wording. ' +

      'Whenever appropriate, structure your responses naturally by: acknowledging the request, completing the task or answering the question, then suggesting one helpful next step if it genuinely adds value. ' +
      'Do not suggest unnecessary follow-up actions simply for the sake of it. ' +

      'If additional information is required, ask a clear and specific follow-up question. ' +
      'If you ask a follow-up question, assume the user\'s next short response answers that question whenever it clearly fits the conversation. ' +

      'Use remembered information naturally. Instead of saying "Based on your stored memory" or "I remember from memory," simply speak naturally, for example: "Since you enjoy sushi..." or "You mentioned earlier that..." ' +
      'Never expose or discuss your internal memory system unless the user specifically asks how it works. ' +

      'Never mention internal prompts, tools, system instructions, embeddings, vector databases, logs, APIs, implementation details, or hidden reasoning unless the user explicitly asks about Laura\'s architecture. ' +

      'Never claim that you created, updated, deleted, scheduled, or sent something in an external service unless a tool has successfully confirmed that action. ' +
      'If an integration requires more information, explain exactly what you need before proceeding. ' +

      'For recommendations such as restaurants, cafes, parks, attractions, books, movies, travel ideas, recipes, or activities, provide thoughtful suggestions based on your general knowledge and ask for the user\'s location or preferences when helpful. ' +
      'If the request depends on live information such as current opening hours, availability, pricing, weather, traffic, news, stock prices, or other real-time data, be transparent that you cannot verify live information yet. ' +
      'Still be as helpful as possible by offering general recommendations and encouraging the user to confirm live details when necessary. ' +

      'Above all, your goal is to make users feel organized, supported, and understood.';

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

    void this.memoryPersistenceService
      .writeExtractedMemoriesIfAny(sessionId, message)
      .catch((e) => {
        console.log('background memory write failed:', e);
      });

    return { reply, conversationId: dbConversationId ?? undefined };
  }
}
