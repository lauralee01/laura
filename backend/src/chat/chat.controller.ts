import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatHistoryService } from './chat-history.service';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequest = {
  sessionId?: string;
  conversationId?: string;
  message: string;
  /** Prior turns in this conversation (optional). Current user message is always `message`. */
  history?: ChatMessage[];
};

type ChatResponse = {
  reply: string;
  conversationId?: string;
};

type ChatHistoryResponse = {
  conversationId?: string;
  messages: ChatMessage[];
};

type ConversationListItem = {
  id: string;
  updatedAt: string;
  preview: string;
};

type ConversationListResponse = {
  conversations: ConversationListItem[];
};

type CreateConversationBody = {
  sessionId?: string;
};

type CreateConversationResponse = {
  conversationId: string;
};

type PatchConversationBody = {
  sessionId?: string;
  title?: string;
};

function normalizeHistory(raw: unknown): ChatMessage[] | undefined {
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
  constructor(
    private readonly chatService: ChatService,
    private readonly chatHistoryService: ChatHistoryService,
  ) {}

  @Get('history')
  async history(
    @Query('sessionId') sessionIdRaw: string,
    @Query('conversationId') conversationIdRaw?: string,
  ): Promise<ChatHistoryResponse> {
    const sessionId = (sessionIdRaw ?? '').trim();
    if (!sessionId) {
      return { messages: [] };
    }

    const conversationId = (conversationIdRaw ?? '').trim();
    const history = await this.chatHistoryService.getConversationHistory(
      sessionId,
      conversationId || undefined,
    );
    if (!history) {
      return { messages: [] };
    }

    return {
      conversationId: history.conversationId,
      messages: history.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
  }

  @Get('conversations')
  async conversations(
    @Query('sessionId') sessionIdRaw: string,
  ): Promise<ConversationListResponse> {
    const sessionId = (sessionIdRaw ?? '').trim();
    if (!sessionId) {
      return { conversations: [] };
    }

    const rows = await this.chatHistoryService.listConversations(sessionId);
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        updatedAt: r.updatedAt,
        preview: r.preview,
      })),
    };
  }

  @Post('conversations')
  async createConversation(
    @Body() body: CreateConversationBody,
  ): Promise<CreateConversationResponse> {
    const sessionId = (body?.sessionId ?? '').trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const id = await this.chatHistoryService.createEmptyConversation(sessionId);
    if (!id) {
      throw new BadRequestException('Could not create conversation');
    }
    return { conversationId: id };
  }

  @Patch('conversations/:conversationId')
  async patchConversation(
    @Param('conversationId') conversationIdRaw: string,
    @Body() body: PatchConversationBody,
  ): Promise<{ ok: true }> {
    const conversationId = (conversationIdRaw ?? '').trim();
    const sessionId = (body?.sessionId ?? '').trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    const title = typeof body?.title === 'string' ? body.title : '';
    const ok = await this.chatHistoryService.updateConversationTitle(
      sessionId,
      conversationId,
      title,
    );
    if (!ok) {
      throw new NotFoundException('Conversation not found');
    }
    return { ok: true };
  }

  @Delete('conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationIdRaw: string,
    @Query('sessionId') sessionIdRaw: string,
  ): Promise<{ ok: true }> {
    const conversationId = (conversationIdRaw ?? '').trim();
    const sessionId = (sessionIdRaw ?? '').trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    const ok = await this.chatHistoryService.deleteConversation(
      sessionId,
      conversationId,
    );
    if (!ok) {
      throw new NotFoundException('Conversation not found');
    }
    return { ok: true };
  }

  @Post()
  async chat(@Body() body: ChatRequest): Promise<ChatResponse> {
    const message = (body?.message ?? '').trim();
    if (!message) {
      return { reply: 'Please send a message.' };
    }

    const sessionId = (body?.sessionId ?? '').trim();
    const conversationId = (body?.conversationId ?? '').trim();
    const history = normalizeHistory(body?.history);
    return this.chatService.replyTo(
      sessionId,
      message,
      history,
      conversationId,
    );
  }
}
