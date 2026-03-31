import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../../../llm/llm.service';
import { IntentRouterService } from '../intent-router.service';

describe('IntentRouterService', () => {
  let service: IntentRouterService;
  let llmGenerate: jest.Mock;

  const prevMinConfidence = process.env.INTENT_TOOL_MIN_CONFIDENCE;

  afterEach(() => {
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

  it('classify calls LLM and returns envelope', async () => {
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
