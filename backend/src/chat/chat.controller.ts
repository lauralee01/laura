import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

type ChatRequest = {
  sessionId?: string;
  message: string;
};

type ChatResponse = {
  reply: string;
};

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
    return { reply: await this.chatService.replyTo(sessionId, message) };
  }
}

