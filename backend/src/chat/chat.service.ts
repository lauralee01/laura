import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { ToolOrchestratorService } from './tool-orchestrator.service';
import { MemoryPersistenceService } from './memory-persistence.service';
import { ChatHistoryService } from './chat-history.service';

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

    const toolReply = await this.toolOrchestrator.tryHandle(sessionId, message);
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
      'Be concise, ask clarifying questions when needed, and follow the user’s intent.';

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
