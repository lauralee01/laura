import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { EmailModule } from '../integrations/email/email.module';
import { CalendarModule } from '../integrations/calendar/calendar.module';
import { ToolOrchestratorService } from './tool-orchestrator.service';
import { MemoryPersistenceService } from './memory-persistence.service';

@Module({
  imports: [LlmModule, MemoryModule, EmailModule, CalendarModule],
  controllers: [ChatController],
  providers: [ChatService, ToolOrchestratorService, MemoryPersistenceService],
})
export class ChatModule {}

