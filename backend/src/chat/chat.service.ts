import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class ChatService {
  constructor(private readonly llmService: LlmService) {}

  async replyTo(message: string): Promise<string> {
    // MVP: single-turn chat.
    // Later: we’ll pass conversation history + retrieved memory.
    const systemPrompt =
      'You are laura, a helpful personalized AI agent. ' +
      'Be concise, ask clarifying questions when needed, and follow the user’s intent.';

    return this.llmService.generate({ systemPrompt, userMessage: message });
  }
}

