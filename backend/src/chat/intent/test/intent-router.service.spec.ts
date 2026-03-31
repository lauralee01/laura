import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../../../llm/llm.service';
import { IntentRouterService } from '../intent-router.service';
import { LlmIntentDisabledError } from '../intent.types';

describe('IntentRouterService', () => {
  let service: IntentRouterService;
  let llmGenerate: jest.Mock;

  const prevFlag = process.env.USE_LLM_INTENT;
  const prevRouteCal = process.env.INTENT_ROUTE_CALENDAR_LIST;
  const prevRouteMut = process.env.INTENT_ROUTE_CALENDAR_MUTATIONS;
  const prevRouteEmail = process.env.INTENT_ROUTE_EMAIL;
  const prevMinConfidence = process.env.INTENT_TOOL_MIN_CONFIDENCE;

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
    if (prevRouteMut === undefined) {
      delete process.env.INTENT_ROUTE_CALENDAR_MUTATIONS;
    } else {
      process.env.INTENT_ROUTE_CALENDAR_MUTATIONS = prevRouteMut;
    }
    if (prevRouteEmail === undefined) {
      delete process.env.INTENT_ROUTE_EMAIL;
    } else {
      process.env.INTENT_ROUTE_EMAIL = prevRouteEmail;
    }
    if (prevMinConfidence === undefined) {
      delete process.env.INTENT_TOOL_MIN_CONFIDENCE;
    } else {
      process.env.INTENT_TOOL_MIN_CONFIDENCE = prevMinConfidence;
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

  it('isLlmIntentEnabled is true by default', () => {
    delete process.env.USE_LLM_INTENT;
    expect(service.isLlmIntentEnabled()).toBe(true);
  });

  it('isLlmIntentEnabled is true for true or 1', () => {
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isLlmIntentEnabled()).toBe(true);
    process.env.USE_LLM_INTENT = '1';
    expect(service.isLlmIntentEnabled()).toBe(true);
  });

  it('isLlmIntentEnabled is false for false or 0', () => {
    process.env.USE_LLM_INTENT = 'false';
    expect(service.isLlmIntentEnabled()).toBe(false);
    process.env.USE_LLM_INTENT = '0';
    expect(service.isLlmIntentEnabled()).toBe(false);
  });

  it('isCalendarListLlmRoutingEnabled is true by default when LLM intent is enabled', () => {
    delete process.env.INTENT_ROUTE_CALENDAR_LIST;
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(true);

    process.env.INTENT_ROUTE_CALENDAR_LIST = 'false';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(false);

    process.env.USE_LLM_INTENT = 'false';
    expect(service.isCalendarListLlmRoutingEnabled()).toBe(false);
  });

  it('isCalendarMutationsLlmRoutingEnabled is true by default when LLM intent is enabled', () => {
    delete process.env.INTENT_ROUTE_CALENDAR_MUTATIONS;
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isCalendarMutationsLlmRoutingEnabled()).toBe(true);

    process.env.INTENT_ROUTE_CALENDAR_MUTATIONS = 'false';
    expect(service.isCalendarMutationsLlmRoutingEnabled()).toBe(false);

    process.env.USE_LLM_INTENT = 'false';
    expect(service.isCalendarMutationsLlmRoutingEnabled()).toBe(false);
  });

  it('isCalendarLlmRoutingEnabled is true by default when LLM intent is enabled', () => {
    process.env.USE_LLM_INTENT = 'true';
    delete process.env.INTENT_ROUTE_CALENDAR_LIST;
    delete process.env.INTENT_ROUTE_CALENDAR_MUTATIONS;
    expect(service.isCalendarLlmRoutingEnabled()).toBe(true);

    process.env.INTENT_ROUTE_CALENDAR_LIST = 'false';
    process.env.INTENT_ROUTE_CALENDAR_MUTATIONS = 'false';
    expect(service.isCalendarLlmRoutingEnabled()).toBe(false);
  });

  it('isEmailLlmRoutingEnabled is true by default when LLM intent is enabled', () => {
    delete process.env.INTENT_ROUTE_EMAIL;
    process.env.USE_LLM_INTENT = 'true';
    expect(service.isEmailLlmRoutingEnabled()).toBe(true);

    process.env.INTENT_ROUTE_EMAIL = 'false';
    expect(service.isEmailLlmRoutingEnabled()).toBe(false);

    process.env.USE_LLM_INTENT = 'false';
    expect(service.isEmailLlmRoutingEnabled()).toBe(false);
  });

  it('isLlmToolRoutingEnabled is true by default when LLM intent is enabled', () => {
    process.env.USE_LLM_INTENT = 'true';
    delete process.env.INTENT_ROUTE_CALENDAR_LIST;
    delete process.env.INTENT_ROUTE_CALENDAR_MUTATIONS;
    delete process.env.INTENT_ROUTE_EMAIL;
    expect(service.isLlmToolRoutingEnabled()).toBe(true);

    process.env.INTENT_ROUTE_CALENDAR_LIST = 'false';
    process.env.INTENT_ROUTE_CALENDAR_MUTATIONS = 'false';
    process.env.INTENT_ROUTE_EMAIL = 'false';
    expect(service.isLlmToolRoutingEnabled()).toBe(false);
  });

  it('getToolRoutingMinConfidence defaults and clamps env values', () => {
    delete process.env.INTENT_TOOL_MIN_CONFIDENCE;
    expect(service.getToolRoutingMinConfidence()).toBe(0.6);

    process.env.INTENT_TOOL_MIN_CONFIDENCE = '0.75';
    expect(service.getToolRoutingMinConfidence()).toBe(0.75);

    process.env.INTENT_TOOL_MIN_CONFIDENCE = '-1';
    expect(service.getToolRoutingMinConfidence()).toBe(0);

    process.env.INTENT_TOOL_MIN_CONFIDENCE = '2';
    expect(service.getToolRoutingMinConfidence()).toBe(1);

    process.env.INTENT_TOOL_MIN_CONFIDENCE = 'not-a-number';
    expect(service.getToolRoutingMinConfidence()).toBe(0.6);
  });

  it('classify throws LlmIntentDisabledError when flag off', async () => {
    process.env.USE_LLM_INTENT = 'false';
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
