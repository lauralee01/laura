import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [LlmModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}

