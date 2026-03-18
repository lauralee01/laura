import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

type ChatRequest = {
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
    return { reply: await this.chatService.replyTo(message) };
  }
}

