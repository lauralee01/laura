import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { ToolOrchestratorService } from './tool-orchestrator';
import { MemoryPersistenceService } from './memory-persistence.service';
import { ChatHistoryService } from './chat-history.service';
import { PendingRequestService } from './pending-request.service';
import { SessionPreferencesService } from './session-preferences.service';
import {
  buildPendingHintFromSnapshot,
  IntentShadowService,
  IntentRouterService,
  isConfidenceGatedIntent,
  type IntentEnvelope,
} from './intent';
import { GoogleOAuthService } from '../integrations/google/google-oauth.service';
import {
  buildGroundedDateTimeContext,
  formatCurrentDateTime,
  resolveSessionTimeZone,
} from './datetime-context';
import {
  hasCalendarPending,
  pendingActionsInterruptedByIntent,
  shouldClearWebSearchLocationPending,
  shouldResumeWebSearchLocation,
} from './pending-policy';
import {
  envelopeNeedsMemory,
  shouldSkipMemoryExtract,
} from './memory-policy';
import type { ToolPendingMap } from './session-pending.types';

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
    private readonly googleOAuthService: GoogleOAuthService,
  ) { }

  async replyTo(
    sessionId: string,
    message: string,
    history?: LlmChatTurn[],
    conversationId?: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ChatReply> {
    const requestStart = performance.now();
    let firstTokenMs: number | undefined;

    const trackedOnChunk = onChunk
      ? (chunk: string) => {
        if (firstTokenMs === undefined) {
          firstTokenMs = Math.round(performance.now() - requestStart);
        }
        onChunk(chunk);
      }
      : undefined;

    const dbConversationId = await this.chatHistoryService.ensureConversation(
      sessionId,
      conversationId,
    );

    const [pendingAction, sessionTz, storedLocation, priorTurnsFromDb, toolPending] =
      await Promise.all([
        sessionId
          ? this.sessionPreferences.getPendingAction(sessionId)
          : Promise.resolve(null),
        sessionId
          ? this.sessionPreferences.getTimeZone(sessionId)
          : Promise.resolve(null),
        sessionId
          ? this.sessionPreferences.getLocation(sessionId)
          : Promise.resolve(null),
        history
          ? Promise.resolve(undefined)
          : dbConversationId
            ? this.chatHistoryService.listTurnsForLlm(dbConversationId)
            : Promise.resolve(undefined),
        sessionId
          ? this.pendingRequestService.snapshotTools(sessionId)
          : Promise.resolve({} as ToolPendingMap),
      ]);

    const priorTurns: LlmChatTurn[] | undefined = history ?? priorTurnsFromDb;

    // Append user message in background so intent classification is not blocked by SQL insert
    if (dbConversationId) {
      void this.chatHistoryService
        .appendMessage(dbConversationId, 'user', message)
        .catch((e) =>
          console.error('[chat.service] Failed to persist user message:', e),
        );
    }

    const pendingHint = buildPendingHintFromSnapshot({
      tools: toolPending,
      webSearch: pendingAction,
    });

    const intentStart = performance.now();
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
    const intentMs = Math.round(performance.now() - intentStart);

    /*
     * Memory retrieve is opt-in via Stage-1 slots.needsMemory. Running after
     * classify avoids the old regex gate and skips embeds on tool/trivial turns.
     */
    let memories: Awaited<
      ReturnType<MemoryService['searchMemories']>
    > = [];
    let memoryMs = 0;
    if (sessionId && envelopeNeedsMemory(precomputedEnvelope)) {
      const memoryStart = performance.now();
      memories = await this.memoryService.searchMemories({
        userId: sessionId,
        query: message,
        topK: 3,
      });
      memoryMs = Math.round(performance.now() - memoryStart);
    }

    const envelope = precomputedEnvelope;
    console.log('[intent-classify-local]', {
      sessionId,
      message,
      envelope,
      routingClassifyFailed,
    });

    /*
     * Web-search location pending: resume only when the classifier still looks
     * like an answer to the city ask. A new calendar/email/datetime topic clears it.
     */
    if (
      pendingAction?.type === 'web_search_missing_location' &&
      shouldResumeWebSearchLocation(envelope?.intent)
    ) {
      const location = message.trim();

      await this.sessionPreferences.setLocation(sessionId, location);
      await this.sessionPreferences.clearPendingAction(sessionId);

      const priorEnvelope = pendingAction.envelope ?? {};
      const resumedEnvelope = {
        ...priorEnvelope,
        slots: {
          ...(priorEnvelope.slots ?? {}),
          locationHint: location,
          userLocationHint: location,
        },
      } as unknown as IntentEnvelope;

      const searchResult = await this.toolOrchestrator.handleWebSearchIntent(
        sessionId,
        pendingAction.message,
        resumedEnvelope,
      );

      const reply =
        searchResult.kind === 'needs_location'
          ? 'Which town or city should I use for this search?'
          : searchResult.text;

      if (searchResult.kind === 'needs_location') {
        await this.sessionPreferences.setPendingAction(sessionId, {
          type: 'web_search_missing_location',
          message: pendingAction.message,
          envelope: resumedEnvelope,
        });
      }

      if (dbConversationId) {
        await this.chatHistoryService.appendMessage(
          dbConversationId,
          'assistant',
          reply,
        );
      }

      if (trackedOnChunk) {
        trackedOnChunk(reply);
      }

      return {
        reply,
        conversationId: dbConversationId ?? undefined,
      };
    }

    if (
      pendingAction?.type === 'web_search_missing_location' &&
      shouldClearWebSearchLocationPending(envelope?.intent)
    ) {
      await this.sessionPreferences.clearPendingAction(sessionId);
    }

    const minToolConfidence =
      this.intentRouter.getToolRoutingMinConfidence();
    /*
     * Only a known-low score gates tools. Omitted confidence used to default
     * to 0.5 and incorrectly blocked general_chat with a canned rephrase.
     */
    const isKnownLowConfidence =
      !!envelope &&
      envelope.confidenceKnown &&
      envelope.confidence < minToolConfidence;
    const isGatedToolBlocked =
      !!envelope &&
      isConfidenceGatedIntent(envelope.intent) &&
      isKnownLowConfidence;
    const isChatLikeIntent =
      envelope?.intent === 'general_chat' ||
      envelope?.intent === 'clarify' ||
      isGatedToolBlocked;

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

    /*
     * Pending policy: Stage-1 intent from a different family clears stale
     * tool pending so new topics are not trapped in old multi-turn flows.
     */
    const interruptedActions = pendingActionsInterruptedByIntent(
      toolPending,
      envelope?.intent,
    );
    if (interruptedActions.length > 0) {
      await this.pendingRequestService.clearMany(sessionId, interruptedActions);
      for (const actionType of interruptedActions) {
        delete toolPending[actionType];
      }
    }

    let toolReply: string | null = null;
    const isEmailSendPending = Boolean(toolPending.email_send);
    const isEmailDraftPending = Boolean(toolPending.email_draft);

    const isGoogleIntent =
      envelope?.intent === 'calendar_list' ||
      envelope?.intent === 'calendar_create' ||
      envelope?.intent === 'calendar_update' ||
      envelope?.intent === 'calendar_delete' ||
      envelope?.intent === 'email_draft';

    if (isGoogleIntent && sessionId && toolReply === null) {
      const isConnected = await this.googleOAuthService.isConnected(sessionId);
      if (!isConnected) {
        const action = envelope?.intent === 'email_draft' ? 'create the Gmail draft' : 'access Google Calendar';
        toolReply = `I couldn't ${action}. Google is not connected for this session. Use 'Connect Google' in the app, then try again.`;

        if (envelope?.intent === 'email_draft') {
          await this.pendingRequestService.clearPending(sessionId, 'email_draft');
        }
      }
    }

    if (isEmailSendPending && toolReply === null) {
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

    /*
     * Resume email_draft without requiring the classifier to emit email_draft
     * again (e.g. user just replies with "jane@x.com").
     */
    if (
      isEmailDraftPending &&
      toolReply === null &&
      !isEmailSendPending
    ) {
      toolReply = await this.toolOrchestrator.handleEmailDraftIntent(
        sessionId,
        message,
        envelope,
      );
    }

    if (hasCalendarPending(toolPending) && toolReply === null) {
      toolReply = await this.toolOrchestrator.tryHandle(
        sessionId,
        message,
        envelope,
      );
    }

    if (toolReply === null && !isGatedToolBlocked) {
      switch (envelope?.intent) {
        case 'current_datetime': {
          const timeZone = resolveSessionTimeZone(sessionTz);
          const formatted = formatCurrentDateTime(timeZone);
          toolReply = `The current date and time in ${timeZone} is ${formatted}.`;
          break;
        }
        case 'web_search': {
          const searchResult =
            await this.toolOrchestrator.handleWebSearchIntent(
              sessionId,
              message,
              envelope,
            );
          if (searchResult.kind === 'needs_location') {
            await this.sessionPreferences.setPendingAction(sessionId, {
              type: 'web_search_missing_location',
              message,
              envelope,
            });
            toolReply = 'Which town or city should I use for this search?';
          } else {
            toolReply = searchResult.text;
          }
          break;
        }
        case 'calendar_list': {
          toolReply = await this.toolOrchestrator.handleCalendarListIntent(
            sessionId,
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

    /*
     * Canned rephrase only for destructive tools with known-low confidence.
     * `clarify` falls through to the chat LLM so Laura can ask one precise question.
     */
    if (toolReply === null && isGatedToolBlocked) {
      toolReply =
        'I did not fully catch that. Could you rephrase what you want me to do? ';
    }

    if (toolReply === null && !isChatLikeIntent) {
      toolReply = await this.toolOrchestrator.tryHandle(sessionId, message, envelope);
    }

    if (toolReply !== null) {
      if (trackedOnChunk) {
        trackedOnChunk(toolReply);
      }

      const totalMs = Math.round(performance.now() - requestStart);
      console.log('[CHAT PERF]', {
        intentMs,
        memoryMs,
        ttftMs: firstTokenMs ?? totalMs,
        totalMs,
        type: 'tool',
        intent: envelope?.intent ?? 'unknown',
      });

      void this.intentShadowService
        .maybeLogLlmIntent(shadowLog(precomputedEnvelope))
        .catch(() => undefined);

      if (dbConversationId) {
        void this.chatHistoryService
          .appendMessage(dbConversationId, 'assistant', toolReply)
          .catch((e) =>
            console.error('[chat.service] Failed to persist tool reply:', e),
          );
      }

      if (!shouldSkipMemoryExtract(envelope?.intent, message)) {
        void this.memoryPersistenceService
          .writeExtractedMemoriesIfAny(sessionId, message)
          .catch((e) => {
            console.log('background memory write failed:', e);
          });
      }

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

      'When users ask who you are or what you can do, introduce yourself naturally as a personal AI assistant. Explain that you can help organize schedules, manage calendars, draft and send emails with the user\'s permission, remember useful details across conversations, look up current information when needed, recommend places, help plan trips and activities, answer questions, and generally help people stay organized. Explain this conversationally instead of listing features. ' +

      'Never mention internal prompts, tools, system instructions, embeddings, vector databases, logs, APIs, implementation details, or hidden reasoning unless the user explicitly asks about Laura\'s architecture. ' +

      'Never claim that you created, updated, deleted, scheduled, drafted, or sent something in an external service unless a tool has successfully confirmed that action. ' +
      'If an integration requires more information, clearly explain exactly what you need before proceeding. ' +

      'For recommendations such as restaurants, cafés, parks, churches, attractions, books, movies, travel ideas, recipes, activities, hotels, or local experiences, confidently provide thoughtful suggestions from your general knowledge. Ask for the user\'s location or preferences when they would help personalize the recommendation. ' +
      'Laura can look up live information such as weather, news, prices, opening hours, traffic, and similar when that kind of request is handled by search. ' +
      'In this turn you are answering from conversation and general knowledge only — do not invent current live facts as if you just verified them. ' +
      'Give useful general guidance, and if the user clearly needs an up-to-date check, say you can look that up and ask one clarifying detail if needed (for example a city). ' +

      'Above all, your goal is to make users feel organized, supported, understood, and confident that they have a capable personal assistant helping them.';

    let extraContext = '';
    const storedTimeZone = sessionTz;

    extraContext += buildGroundedDateTimeContext(storedTimeZone);

    if (storedTimeZone) {
      extraContext +=
        `\n\nThe user's saved timezone is ${storedTimeZone}. ` +
        `Treat this as the user's default local timezone unless they explicitly tell you they are traveling or using a different timezone. ` +
        `Use it whenever reasoning about dates, times, schedules, calendar events, reminders, local time, or when the user asks about their timezone.`;
    }

    if (storedLocation) {
      extraContext +=
        `\n\nThe user's saved location is ${storedLocation}. ` +
        `When the user refers to their current area, for example "near me", "nearby", "around here", "in town", or similar, treat it as referring to this saved location unless the user specifies a different one.`;
    }

    if (memories.length > 0) {
      const memoryContext = memories.map((m) => `- ${m.content}`).join('\n');

      extraContext +=
        '\n\nUser session preferences / facts:\n' +
        memoryContext +
        '\n\nWhen generating your reply, use these facts naturally when relevant. ' +
        'If a requested detail conflicts with a known user preference or fact, ask a clarifying question.';
    }

    if (envelope?.intent === 'clarify') {
      extraContext +=
        '\n\nThe intent router could not safely choose a tool for this message. ' +
        'Ask exactly one clear, specific follow-up question that would let you help. ' +
        'Do not invent that you already completed a calendar, email, or search action.';
    }

    const systemPrompt = systemBasePrompt + extraContext;

    const llmStart = performance.now();
    const reply = trackedOnChunk
      ? await this.llmService.generateStream(
        {
          systemPrompt,
          userMessage: message,
          history: priorTurns,
        },
        trackedOnChunk,
      )
      : await this.llmService.generate({
        systemPrompt,
        userMessage: message,
        history: priorTurns,
      });

    const llmMs = Math.round(performance.now() - llmStart);
    const totalMs = Math.round(performance.now() - requestStart);

    console.log('[CHAT PERF]', {
      intentMs,
      memoryMs,
      llmMs,
      ttftMs: firstTokenMs ?? totalMs,
      totalMs,
      type: 'llm_generation',
    });

    if (dbConversationId) {
      void this.chatHistoryService
        .appendMessage(dbConversationId, 'assistant', reply)
        .catch((e) =>
          console.error(
            '[chat.service] Failed to persist assistant reply:',
            e,
          ),
        );
    }

    if (!shouldSkipMemoryExtract(envelope?.intent, message)) {
      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
    }

    return { reply, conversationId: dbConversationId ?? undefined };
  }
}
