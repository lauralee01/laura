import { Injectable } from '@nestjs/common';
import { LlmChatTurn, LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { ToolOrchestratorService } from './tool-orchestrator.service';
import { MemoryPersistenceService } from './memory-persistence.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly llmService: LlmService,
    private readonly memoryService: MemoryService,
    private readonly toolOrchestrator: ToolOrchestratorService,
    private readonly memoryPersistenceService: MemoryPersistenceService
  ) {}

  async replyTo(
    sessionId: string,
    message: string,
    history?: LlmChatTurn[]
  ): Promise<string> {
    const toolReply = await this.toolOrchestrator.tryHandle(sessionId, message);
    if (toolReply) {
      // Keep implicit memory write even for tool paths.
      await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
        sessionId,
        message
      );
      return toolReply;
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
        const memoryContext = memories
          .map((m) => `- ${m.content}`)
          .join('\n');

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
      history,
    });

    await this.memoryPersistenceService.writeExtractedMemoriesIfAny(
      sessionId,
      message
    );

    return reply;
  }
}
