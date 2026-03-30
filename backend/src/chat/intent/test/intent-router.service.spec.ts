import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../../../llm/llm.service';
import { IntentRouterService } from '../intent-router.service';
import { LlmIntentDisabledError } from '../intent.types';

describe('IntentRouterService', () => {
  let service: IntentRouterService;
  let llmGenerate: jest.Mock;

  const prevFlag = process.env.USE_LLM_INTENT;
  const prevRouteCal = process.env.INTENT_ROUTE_CALENDAR_LIST;

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.USE_LLM_INTENT;
    } else {
      process.env.USE_LLM_INTENT = prevFlag;
    }
    if (prevRouteCal === undefined) {
      delete process.env.INTENT_ROUTE_CALENDAR_LIST;
    } else {
      process.env.INTENT_ROUTE_CALENDAR_LIST = prevRouteCal;
    }
  });

  beforeEach(async () => {
    llmGenerate = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentRouterService,
        { provide: LlmService, useValue: { generate: llmGenerate } },
      ],
    }).compile();

    service = module.get(IntentRouterService);
  });

  it('isLlmIntentEnabled is false by default', () => {
    delete process.env.USE_LLM_INTENT;
    expect(service.isLlmIntentEnabled()).toBe(false);
  });

  it('isLlmIntentEnabled is true for true or 1', () => {
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isLlmIntentEnabled()).toBe(true);
    process.env.USE_LLM_INTENT = '1';
    expect(service.isLlmIntentEnabled()).toBe(true);
  });

  it('isCalendarListLlmRoutingEnabled requires both flags', () => {
    delete process.env.INTENT_ROUTE_CALENDAR_LIST;
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(false);

    process.env.INTENT_ROUTE_CALENDAR_LIST = 'true';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(true);

    process.env.USE_LLM_INTENT = 'false';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(false);
  });

  it('classify throws LlmIntentDisabledError when flag off', async () => {
    delete process.env.USE_LLM_INTENT;
    await expect(
      service.classify({ userMessage: 'hello' }),
    ).rejects.toThrow(LlmIntentDisabledError);
    expect(llmGenerate).not.toHaveBeenCalled();
  });

  it('classify calls LLM and returns envelope when flag on', async () => {
    process.env.USE_LLM_INTENT = 'true';
    llmGenerate.mockResolvedValue(
      JSON.stringify({
        version: 1,
        intent: 'calendar_list',
        confidence: 0.92,
        missingSlots: ['timeZone'],
        slots: { listMode: 'tomorrow' },
      }),
    );

    const env = await service.classify({
      userMessage: 'What do I have tomorrow?',
      sessionTimeZone: 'America/Chicago',
    });

    expect(env.intent).toBe('calendar_list');
    expect(env.missingSlots).toEqual(['timeZone']);
    expect(env.slots).toEqual({ listMode: 'tomorrow' });
    expect(llmGenerate).toHaveBeenCalledTimes(1);
    const call = llmGenerate.mock.calls[0][0];
    expect(call.userMessage).toContain('What do I have tomorrow?');
    expect(call.userMessage).toContain('America/Chicago');
  });
});
