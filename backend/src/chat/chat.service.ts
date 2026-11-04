import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
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

    const toolReply = await this.toolRouting.resolveToolReply({
      sessionId,
      message,
      envelope,
      toolPending,
      sessionTz,
      isGatedToolBlocked,
      isChatLikeIntent,
    });

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

    const systemPrompt = buildLauraChatSystemPrompt({
      sessionTimeZone: sessionTz,
      storedLocation,
      memories,
      intent: envelope?.intent,
    });

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
