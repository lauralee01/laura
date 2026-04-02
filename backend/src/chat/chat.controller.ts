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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { getSessionId } from '../common/session/session.util';
import { ChatService } from './chat.service';
import { ChatHistoryService } from './chat-history.service';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequest = {
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

type CreateConversationResponse = {
  conversationId: string;
};

type PatchConversationBody = {
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
    @Req() req: Request,
    @Query('conversationId') conversationIdRaw?: string,
  ): Promise<ChatHistoryResponse> {
    const sessionId = getSessionId(req);
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
  async conversations(@Req() req: Request): Promise<ConversationListResponse> {
    const sessionId = getSessionId(req);
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
  async createConversation(@Req() req: Request): Promise<CreateConversationResponse> {
    const sessionId = getSessionId(req);
    const id = await this.chatHistoryService.createEmptyConversation(sessionId);
    if (!id) {
      throw new BadRequestException('Could not create conversation');
    }
    return { conversationId: id };
  }

  @Patch('conversations/:conversationId')
  async patchConversation(
    @Req() req: Request,
    @Param('conversationId') conversationIdRaw: string,
    @Body() body: PatchConversationBody,
  ): Promise<{ ok: true }> {
    const sessionId = getSessionId(req);
    const conversationId = (conversationIdRaw ?? '').trim();
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
    @Req() req: Request,
    @Param('conversationId') conversationIdRaw: string,
  ): Promise<{ ok: true }> {
    const sessionId = getSessionId(req);
    const conversationId = (conversationIdRaw ?? '').trim();
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
  async chat(@Req() req: Request, @Body() body: ChatRequest): Promise<ChatResponse> {
    const message = (body?.message ?? '').trim();
    if (!message) {
      return { reply: 'Please send a message.' };
    }

    const sessionId = getSessionId(req);
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
