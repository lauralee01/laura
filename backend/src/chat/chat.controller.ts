import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequest = {
  sessionId?: string;
  message: string;
  /** Prior turns in this conversation (optional). Current user message is always `message`. */
  history?: ChatMessage[];
};

type ChatResponse = {
  reply: string;
};

function normalizeHistory(
  raw: unknown
): ChatMessage[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      continue;
    }
    out.push({ role, content });
  }
  return out.length > 0 ? out : undefined;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: ChatRequest): Promise<ChatResponse> {
    const message = (body?.message ?? '').trim();
    if (!message) {
      return { reply: 'Please send a message.' };
    }

    const sessionId = (body?.sessionId ?? '').trim();
    const history = normalizeHistory(body?.history);
    return {
      reply: await this.chatService.replyTo(sessionId, message, history),
    };
  }
}

