import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { GoogleOAuthService } from '../integrations/google/google-oauth.service';
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
import { ToolOrchestratorService } from './tool-orchestrator';
import {
  pendingActionsInterruptedByIntent,
  shouldClearWebSearchLocationPending,
  shouldResumeWebSearchLocation,
} from './pending-policy';
import {
  envelopeNeedsMemory,
  shouldSkipMemoryExtract,
} from './memory-policy';
import { buildLauraChatSystemPrompt } from './laura-system-prompt';
import { ToolRoutingService } from './tool-routing.service';
import { logChatPerf } from './chat-perf';
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
    private readonly toolRouting: ToolRoutingService,
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
    signal?: AbortSignal,
  ): Promise<ChatReply> {
    const requestStart = performance.now();
    let firstTokenMs: number | undefined;
    /*
     * Only tokens actually delivered to the client. On Stop, Gemini may
     * return a longer string than we streamed — persist the visible partial
     * so "continue" history matches the UI instead of duplicating a full reply.
     */
    let streamedVisible = '';

    const trackedOnChunk = onChunk
      ? (chunk: string) => {
        if (signal?.aborted) {
          return;
        }
        if (firstTokenMs === undefined) {
          firstTokenMs = Math.round(performance.now() - requestStart);
        }
        streamedVisible += chunk;
        onChunk(chunk);
      }
      : undefined;

    /*
     * Bootstrap in parallel: conversation row + one session_preferences read
     * (tz, location, pending JSON). Tools are pruned in-memory from that row.
     */
    const bootstrapStart = performance.now();
    const [dbConversationId, sessionBootstrap] = await Promise.all([
      this.chatHistoryService.ensureConversation(sessionId, conversationId),
      sessionId
        ? this.sessionPreferences.getChatBootstrap(sessionId)
        : Promise.resolve({
            timeZone: null as string | null,
            location: null as string | null,
            webSearch: null,
            tools: {} as ToolPendingMap,
          }),
    ]);
    const pendingAction = sessionBootstrap.webSearch;
    const sessionTz = sessionBootstrap.timeZone;
    const storedLocation = sessionBootstrap.location;
    const toolPending = sessionId
      ? await this.pendingRequestService.activateToolsSnapshot(
          sessionId,
          sessionBootstrap.tools,
        )
      : ({} as ToolPendingMap);
    const bootstrapMs = Math.round(performance.now() - bootstrapStart);
    const ensureConversationMs = bootstrapMs;
    const prefetchMs = bootstrapMs;

    let historyMs = 0;
    let priorTurnsFromDb: LlmChatTurn[] | undefined;
    if (!history && dbConversationId) {
      const historyStart = performance.now();
      priorTurnsFromDb =
        await this.chatHistoryService.listTurnsForLlm(dbConversationId);
      historyMs = Math.round(performance.now() - historyStart);
    }

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

    /*
     * Speculative Google OAuth during classify — calendar/email intents need
     * it on the tool path; overlapping hides Redis latency behind the LLM.
     */
    const googleConnectedPromise = sessionId
      ? this.googleOAuthService.isConnected(sessionId)
      : Promise.resolve(false);

    const intentStart = performance.now();
    const classifyPromise = this.intentRouter
      .classify({
        userMessage: message,
        pendingHint,
        sessionTimeZone: sessionTz ?? undefined,
        history: priorTurns,
      })
      .then(
        (result) => ({ ok: true as const, result }),
        () => ({ ok: false as const, result: undefined }),
      );

    const [classifyOutcome, googleConnected] = await Promise.all([
      classifyPromise,
      googleConnectedPromise.catch(() => false),
    ]);
    const routingClassifyFailed = !classifyOutcome.ok;
    const precomputedEnvelope = classifyOutcome.ok
      ? classifyOutcome.result
      : undefined;
    const intentMs = Math.round(performance.now() - intentStart);

    /*
     * Memory retrieve is opt-in via Stage-1 slots.needsMemory. Running after
     * classify avoids the old regex gate and skips embeds on tool/trivial turns.
     */
    let memories: Awaited<
      ReturnType<MemoryService['searchMemories']>
    > = [];
    let memoryMs = 0;
    const memorySkipped = !(
      sessionId && envelopeNeedsMemory(precomputedEnvelope)
    );
    if (!memorySkipped) {
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
        trackedOnChunk,
        { location, timeZone: sessionTz },
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

      /*
       * Synthesis may already have streamed; only dump once for
       * needs_location / non-stream paths.
       */
      if (
        trackedOnChunk &&
        !(searchResult.kind === 'reply' && searchResult.streamed)
      ) {
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

    let effectiveLocation = storedLocation;
    if (sessionId && userLocationHint) {
      effectiveLocation = userLocationHint;
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

    const routeStart = performance.now();
    const toolResult = await this.toolRouting.resolveToolReply({
      sessionId,
      message,
      envelope,
      toolPending,
      sessionTz,
      storedLocation: effectiveLocation,
      googleConnected,
      isGatedToolBlocked,
      isChatLikeIntent,
      onChunk: trackedOnChunk,
    });
    const routeMs = Math.round(performance.now() - routeStart);

    if (toolResult !== null) {
      if (trackedOnChunk && !toolResult.alreadyStreamed) {
        trackedOnChunk(toolResult.text);
      }

      const totalMs = Math.round(performance.now() - requestStart);
      logChatPerf({
        type: 'tool',
        intent: envelope?.intent ?? 'unknown',
        ensureConversationMs,
        prefetchMs,
        historyMs,
        intentMs,
        memoryMs,
        memorySkipped,
        routeMs,
        ttftMs: firstTokenMs ?? totalMs,
        totalMs,
      });

      void this.intentShadowService
        .maybeLogLlmIntent(shadowLog(precomputedEnvelope))
        .catch(() => undefined);

      if (dbConversationId) {
        void this.chatHistoryService
          .appendMessage(dbConversationId, 'assistant', toolResult.text)
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
        reply: toolResult.text,
        conversationId: dbConversationId ?? undefined,
      };
    }

    const systemPrompt = buildLauraChatSystemPrompt({
      sessionTimeZone: sessionTz,
      storedLocation: effectiveLocation,
      memories,
      intent: envelope?.intent,
    });

    const llmStart = performance.now();
    /*
     * Chat replies feel slow when Gemini spends the budget on hidden
     * thinking before the first visible token. Disable thinking here so
     * TTFT tracks answer tokens, not internal deliberation.
     */
    const chatLlmInput = {
      systemPrompt,
      userMessage: message,
      history: priorTurns,
      thinkingBudget: 0 as const,
    };

    if (signal?.aborted) {
      return {
        reply: '',
        conversationId: dbConversationId ?? undefined,
      };
    }

    const reply = trackedOnChunk
      ? await this.llmService.generateStream(
          chatLlmInput,
          trackedOnChunk,
          signal,
        )
      : await this.llmService.generate(chatLlmInput);

    const llmMs = Math.round(performance.now() - llmStart);
    const totalMs = Math.round(performance.now() - requestStart);

    logChatPerf({
      type: 'llm_generation',
      intent: envelope?.intent ?? 'unknown',
      ensureConversationMs,
      prefetchMs,
      historyMs,
      intentMs,
      memoryMs,
      memorySkipped,
      routeMs,
      llmMs,
      ttftMs: firstTokenMs ?? totalMs,
      totalMs,
    });

    const textToPersist = onChunk ? streamedVisible : reply;

    /*
     * Persist whatever the user actually saw — including a Stop-aborted
     * partial — so the next turn's history matches the UI.
     */
    if (dbConversationId && textToPersist.trim()) {
      void this.chatHistoryService
        .appendMessage(dbConversationId, 'assistant', textToPersist)
        .catch((e) =>
          console.error(
            '[chat.service] Failed to persist assistant reply:',
            e,
          ),
        );
    }

    if (
      textToPersist.trim() &&
      !shouldSkipMemoryExtract(envelope?.intent, message)
    ) {
      void this.memoryPersistenceService
        .writeExtractedMemoriesIfAny(sessionId, message)
        .catch((e) => {
          console.log('background memory write failed:', e);
        });
    }

    return {
      reply: textToPersist,
      conversationId: dbConversationId ?? undefined,
    };
  }
}
