import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { EmailModule } from '../integrations/email/email.module';
import { CalendarModule } from '../integrations/calendar/calendar.module';

@Module({
  imports: [LlmModule, MemoryModule, EmailModule, CalendarModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}

