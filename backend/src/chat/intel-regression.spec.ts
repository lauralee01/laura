import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';
import { ToolOrchestratorService } from './tool-orchestrator';
import { MemoryPersistenceService } from './memory-persistence.service';
import { ChatHistoryService } from './chat-history.service';
import { PendingRequestService } from './pending-request.service';
import { SessionPreferencesService } from './session-preferences.service';
import { IntentShadowService, IntentRouterService } from './intent';
import { GoogleOAuthService } from '../integrations/google/google-oauth.service';
import { EmailToolHandler } from './tool-orchestrator/email/email-tool.handler';
import { EmailService } from '../integrations/email/email.service';
import { ToolRoutingService } from './tool-routing.service';
import type { IntentEnvelope } from './intent/intent.types';
import type { ToolPendingMap } from './session-pending.types';

function envelope(
  intent: IntentEnvelope['intent'],
  slots: Record<string, unknown> = {},
  confidence = 0.9,
): IntentEnvelope {
  return {
    version: 1,
    intent,
    confidence,
    confidenceKnown: true,
    missingSlots: [],
    slots,
  };
}

describe('chat pipeline intelligence regressions', () => {
  let chat: ChatService;
  let classify: jest.Mock;
  let searchMemories: jest.Mock;
  let clearMany: jest.Mock;
  let snapshotTools: jest.Mock;
  let handleWebSearchIntent: jest.Mock;
  let llmGenerate: jest.Mock;
  let writeExtracted: jest.Mock;
  let toolPending: ToolPendingMap;

  beforeEach(async () => {
    classify = jest.fn();
    searchMemories = jest.fn().mockResolvedValue([]);
    clearMany = jest.fn().mockResolvedValue(undefined);
    toolPending = {};
    snapshotTools = jest.fn(async () => ({ ...toolPending }));
    handleWebSearchIntent = jest.fn().mockResolvedValue({
      kind: 'ok',
      text: 'Here is the weather outlook.',
    });
    llmGenerate = jest.fn().mockResolvedValue(
      'Could you tell me which calendar event you mean?',
    );
    writeExtracted = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        ToolRoutingService,
        {
          provide: LlmService,
          useValue: {
            generate: llmGenerate,
            generateStream: jest.fn(),
          },
        },
        {
          provide: MemoryService,
          useValue: { searchMemories },
        },
        {
          provide: ToolOrchestratorService,
          useValue: {
            handleWebSearchIntent,
            handleCalendarListIntent: jest.fn(),
            handleCalendarCreateIntent: jest.fn(),
            handleCalendarMutationIntent: jest.fn(),
            handleEmailDraftIntent: jest.fn(),
            handlePendingEmailSendTurn: jest.fn().mockResolvedValue(null),
            tryLlmRoutedEmail: jest.fn().mockResolvedValue(null),
            tryHandle: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: MemoryPersistenceService,
          useValue: { writeExtractedMemoriesIfAny: writeExtracted },
        },
        {
          provide: ChatHistoryService,
          useValue: {
            ensureConversation: jest.fn().mockResolvedValue('conv-1'),
            listTurnsForLlm: jest.fn().mockResolvedValue([]),
            appendMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PendingRequestService,
          useValue: {
            snapshotTools,
            clearMany,
            clearPending: jest.fn(),
            getPending: jest.fn().mockResolvedValue(null),
            setPending: jest.fn(),
          },
        },
        {
          provide: SessionPreferencesService,
          useValue: {
            getPendingAction: jest.fn().mockResolvedValue(null),
            getTimeZone: jest.fn().mockResolvedValue('America/Chicago'),
            getLocation: jest.fn().mockResolvedValue(null),
            setLocation: jest.fn(),
            clearPendingAction: jest.fn(),
            setPendingAction: jest.fn(),
          },
        },
        {
          provide: IntentShadowService,
          useValue: {
            maybeLogLlmIntent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: IntentRouterService,
          useValue: {
            classify,
            getToolRoutingMinConfidence: () => 0.6,
          },
        },
        {
          provide: GoogleOAuthService,
          useValue: { isConnected: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    chat = module.get(ChatService);
  });

  it('clears calendar pending when Stage-1 switches to web_search', async () => {
    toolPending = {
      calendar_delete: {
        actionType: 'calendar_delete',
        originalMessage: 'delete dentist',
        payload: { phase: 'confirm' },
        missingSlots: ['confirmation'],
        collectedSlots: {},
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    };

    classify.mockResolvedValue(
      envelope('web_search', { query: 'weather in Chicago' }),
    );

    const result = await chat.replyTo(
      'sess-1',
      "what's the weather?",
      [],
    );

    expect(clearMany).toHaveBeenCalledWith('sess-1', ['calendar_delete']);
    expect(handleWebSearchIntent).toHaveBeenCalled();
    expect(result.reply).toContain('weather');
    expect(llmGenerate).not.toHaveBeenCalled();
  });

  it('routes clarify to the chat LLM, not the canned rephrase', async () => {
    classify.mockResolvedValue(envelope('clarify', {}, 0.2));

    const result = await chat.replyTo('sess-1', 'do the thing', []);

    expect(llmGenerate).toHaveBeenCalled();
    expect(result.reply).toBe(
      'Could you tell me which calendar event you mean?',
    );
    expect(result.reply).not.toMatch(/did not fully catch that/i);
  });

  it('retrieves memory only when slots.needsMemory is true', async () => {
    classify.mockResolvedValue(
      envelope('general_chat', { needsMemory: true }),
    );
    searchMemories.mockResolvedValue([
      {
        id: 1,
        content: 'Prefers short answers',
        createdAt: new Date().toISOString(),
        distance: 0.1,
      },
    ]);

    await chat.replyTo(
      'sess-1',
      'Remind me what I said about interview prep',
      [],
    );

    expect(searchMemories).toHaveBeenCalledWith({
      userId: 'sess-1',
      query: 'Remind me what I said about interview prep',
      topK: 3,
    });
    expect(llmGenerate).toHaveBeenCalled();
    const generateArg = llmGenerate.mock.calls[0][0];
    expect(generateArg.thinkingBudget).toBe(0);
    const systemPrompt = generateArg.systemPrompt as string;
    expect(systemPrompt).toContain('Prefers short answers');
    expect(systemPrompt).toContain('look up live information');
    expect(systemPrompt).not.toMatch(/cannot verify live information/i);
  });

  it('skips memory retrieve when needsMemory is absent', async () => {
    classify.mockResolvedValue(envelope('general_chat', {}));

    await chat.replyTo('sess-1', 'Explain recursion simply', []);

    expect(searchMemories).not.toHaveBeenCalled();
  });
});

describe('email draft without @ gate', () => {
  let handler: EmailToolHandler;
  let setPending: jest.Mock;
  let generate: jest.Mock;

  beforeEach(async () => {
    setPending = jest.fn().mockResolvedValue(undefined);
    generate = jest.fn().mockResolvedValue(
      JSON.stringify({
        recipients: [],
        recipientName: 'Jane',
        subject: null,
        tone: null,
        context: 'about the offer',
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailToolHandler,
        {
          provide: LlmService,
          useValue: { generate },
        },
        {
          provide: EmailService,
          useValue: { draftEmail: jest.fn() },
        },
        {
          provide: PendingRequestService,
          useValue: {
            getPending: jest.fn().mockResolvedValue(null),
            setPending,
            clearPending: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get(EmailToolHandler);
  });

  it('keeps name + body and asks for address when message has no @', async () => {
    const reply = await handler.handleEmailDraftIntent(
      'sess-1',
      'Email Jane about the offer',
      envelope('email_draft', {
        recipient: 'Jane',
        body: 'about the offer',
      }),
    );

    expect(reply).toMatch(/Jane/i);
    expect(reply).toMatch(/email address/i);
    expect(setPending).toHaveBeenCalled();
    const pendingArg = setPending.mock.calls[0][1];
    expect(pendingArg.payload.recipientName).toBe('Jane');
    expect(pendingArg.payload.context).toBe('about the offer');
    expect(pendingArg.missingSlots).toEqual(['recipientEmail']);
    /*
     * Slots already filled body + name, so extract LLM is not required.
     */
    expect(generate).not.toHaveBeenCalled();
  });

  it('still extracts name + context when Stage-1 slots are empty', async () => {
    const reply = await handler.handleEmailDraftIntent(
      'sess-1',
      'Email Jane about the offer',
      envelope('email_draft', {}),
    );

    expect(generate).toHaveBeenCalled();
    expect(reply).toMatch(/Jane/i);
    const pendingArg = setPending.mock.calls[0][1];
    expect(pendingArg.payload.recipientName).toBe('Jane');
    expect(pendingArg.payload.context).toBe('about the offer');
  });
});
