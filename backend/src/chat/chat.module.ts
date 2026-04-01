import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { EmailModule } from '../integrations/email/email.module';
import { CalendarModule } from '../integrations/calendar/calendar.module';
import {
  CalendarToolHandler,
  EmailToolHandler,
  ToolOrchestratorService,
  ToolPendingFlowService,
} from './tool-orchestrator';
import { MemoryPersistenceService } from './memory-persistence.service';
import { ChatHistoryService } from './chat-history.service';
import { SessionPreferencesService } from './session-preferences.service';
import { PendingRequestService } from './pending-request.service';
import { IntentRouterService, IntentShadowService } from './intent';

@Module({
  imports: [LlmModule, MemoryModule, EmailModule, CalendarModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    IntentRouterService,
    IntentShadowService,
    CalendarToolHandler,
    EmailToolHandler,
    ToolPendingFlowService,
    ToolOrchestratorService,
    MemoryPersistenceService,
    ChatHistoryService,
    SessionPreferencesService,
    PendingRequestService,
  ],
})
export class ChatModule {}
