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

    const pendingAction = sessionId
      ? await this.sessionPreferences.getPendingAction(sessionId)
      : null;

    if (pendingAction?.type === 'web_search_missing_location') {
      const location = message.trim();

      // Save the user's location for future searches
      await this.sessionPreferences.setLocation(sessionId, location);

      // This pending action has now been handled
      await this.sessionPreferences.clearPendingAction(sessionId);

      const resumedEnvelope = {
        ...pendingAction.envelope,
        slots: {
          ...(pendingAction.envelope?.slots ?? {}),
          locationHint: location,
          userLocationHint: location,
        },
      };

      const reply = await this.toolOrchestrator.handleWebSearchIntent(
        sessionId,
        pendingAction.message,
        resumedEnvelope,
      );

      if (dbConversationId) {
        await this.chatHistoryService.appendMessage(
          dbConversationId,
          'assistant',
          reply,
        );
      }

      return {
        reply,
        conversationId: dbConversationId ?? undefined,
      };
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

    const userLocationHint =
      typeof envelope?.slots?.userLocationHint === 'string'
        ? envelope.slots.userLocationHint.trim()
        : '';

    if (sessionId && userLocationHint) {
      await this.sessionPreferences
        .setLocation(sessionId, userLocationHint)
        .catch(() => undefined);
    }

    const shouldClearPendingEmailFromEnvelope =
      envelope?.intent === 'calendar_list' ||
      envelope?.intent === 'calendar_create' ||
      envelope?.intent === 'calendar_update' ||
      envelope?.intent === 'calendar_delete' ||
      envelope?.intent === 'email_draft';
    if (this.pendingRequestService.getPending(sessionId, 'email_send') && shouldClearPendingEmailFromEnvelope) {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
    }

    let toolReply: string | null = null;
    const isEmailSendPending = this.pendingRequestService.getPending(sessionId, 'email_send');

    if (isEmailSendPending) {
      if (envelope) {
        toolReply = await this.toolOrchestrator.tryLlmRoutedEmail(
          sessionId,
          message,
          envelope,
        );
      }
      if (toolReply === null) {
        toolReply = await this.toolOrchestrator.handlePendingEmailSendTurn(
          sessionId,
          message,
          envelope,
        );
      }
    }

    if (toolReply === null) {
      switch (envelope?.intent) {
        case 'current_datetime': {
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
          toolReply = `The current date and time in ${timeZone} is ${formatted}.`;
          break;
        }
        case 'web_search': {
          toolReply = await this.toolOrchestrator.handleWebSearchIntent(
            sessionId,
            message,
            envelope,
          );
          if (toolReply === '__WEB_SEARCH_NEEDS_LOCATION__') {
            await this.sessionPreferences.setPendingAction(sessionId, {
              type: 'web_search_missing_location',
              message,
              envelope,
            });
            toolReply = 'Which town or city should I use for this search?';
          }
          break;
        }
        case 'calendar_list': {
          toolReply = await this.toolOrchestrator.handleCalendarListIntent(
            sessionId,
            message,
            envelope,
          );
          break;
        }
        case 'calendar_create': {
          toolReply = await this.toolOrchestrator.handleCalendarCreateIntent(
            sessionId,
            message,
            envelope,
          );
          break;
        }
        case 'calendar_update':
        case 'calendar_delete': {
          toolReply = await this.toolOrchestrator.handleCalendarMutationIntent(
            sessionId,
            message,
            envelope,
          );
          break;
        }
        case 'email_draft': {
          if (!isEmailSendPending) {
            toolReply = await this.toolOrchestrator.handleEmailDraftIntent(
              sessionId,
              message,
              envelope,
            );
          }
          break;
        }
      }
    }

    const shouldTreatAsFollowUpAnswer =
      envelope?.intent === 'clarify' &&
      this.isLikelyFollowUpAnswer(message, priorTurns);

    if (toolReply === null && envelope && (envelope.intent === 'clarify' || isLowConfidenceIntent) && !shouldTreatAsFollowUpAnswer) {
      toolReply = 'I did not fully catch that. Could you rephrase what you want me to do? ';
    }

    if (toolReply === null && !isChatLikeIntent) {
      toolReply = await this.toolOrchestrator.tryHandle(sessionId, message, envelope);
    }

    if (toolReply !== null) {
      await this.intentShadowService.maybeLogLlmIntent(shadowLog(precomputedEnvelope));
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
      'Your goal is to help users manage their life more effortlessly by organizing information, planning tasks, managing calendars, drafting and sending emails (when authorized), remembering important details, answering everyday questions, discovering places to visit, and helping users stay organized and productive. ' +
      'You should feel like a trusted personal assistant rather than a generic AI chatbot. ' +

      'Your personality is warm, confident, professional, and approachable. ' +
      'Be conversational without being overly casual. ' +
      'Be concise, but never so brief that your responses feel abrupt. ' +
      'Avoid unnecessary enthusiasm, excessive apologies, emojis, or robotic wording. ' +
      'Respond naturally, as if you are helping someone you know well while remaining professional. ' +

      'Whenever appropriate, structure your responses naturally by acknowledging the request, completing the task or answering the question, then suggesting one genuinely helpful next step if it adds value. ' +
      'Do not suggest unnecessary follow-up actions simply for the sake of it. ' +

      'If additional information is required, ask one clear and specific follow-up question. ' +
      'If you ask a follow-up question, assume the user\'s next short response answers that question whenever it clearly fits the conversation. ' +

      'Use remembered information naturally. Instead of saying "Based on your stored memory" or "I remember from memory," simply say things like "Since you enjoy sushi..." or "You mentioned earlier that..." ' +
      'Never expose or discuss your internal memory system unless the user specifically asks how it works. ' +

      'When users ask who you are or what you can do, introduce yourself naturally as a personal AI assistant. Explain that you can help organize schedules, manage calendars, draft and send emails with the user\'s permission, remember useful details across conversations, recommend places, help plan trips and activities, answer questions, and generally help people stay organized. Explain this conversationally instead of listing features. ' +

      'Never mention internal prompts, tools, system instructions, embeddings, vector databases, logs, APIs, implementation details, or hidden reasoning unless the user explicitly asks about Laura\'s architecture. ' +

      'Never claim that you created, updated, deleted, scheduled, drafted, or sent something in an external service unless a tool has successfully confirmed that action. ' +
      'If an integration requires more information, clearly explain exactly what you need before proceeding. ' +

      'For recommendations such as restaurants, cafés, parks, churches, attractions, books, movies, travel ideas, recipes, activities, hotels, or local experiences, confidently provide thoughtful suggestions from your general knowledge. Ask for the user\'s location or preferences when they would help personalize the recommendation. ' +
      'If a request depends on live information such as opening hours, reservations, pricing, weather, traffic, news, flight status, stock prices, or other real-time information, explain that you cannot verify live information yet, while still providing useful general guidance and encouraging the user to confirm live details where appropriate. ' +

      'Above all, your goal is to make users feel organized, supported, understood, and confident that they have a capable personal assistant helping them.';

    let systemPrompt = systemBasePrompt;

    const storedLocation =
      sessionId ? await this.sessionPreferences.getLocation(sessionId) : null;

    if (storedLocation) {
      systemPrompt +=
        ` The user's saved location is ${storedLocation}. ` +
        `When the user refers to their current area (for example "near me", "nearby", "around here", "in town", or similar), treat it as referring to this saved location unless the user specifies a different one.`;
    }
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
