import { Test, TestingModule } from '@nestjs/testing';
import { IntentShadowService } from '../intent-shadow.service';
import { IntentRouterService } from '../intent-router.service';

describe('IntentShadowService', () => {
  let service: IntentShadowService;
  let classify: jest.Mock;

  const prevUse = process.env.USE_LLM_INTENT;
  const prevShadow = process.env.INTENT_SHADOW_LOG;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.USE_LLM_INTENT = prevUse;
    process.env.INTENT_SHADOW_LOG = prevShadow;
    process.env.NODE_ENV = prevNodeEnv;
  });

  beforeEach(async () => {
    classify = jest.fn().mockResolvedValue({
      version: 1,
      intent: 'general_chat',
      confidence: 0.9,
      missingSlots: [],
      slots: {},
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentShadowService,
        {
          provide: IntentRouterService,
          useValue: {
            isLlmIntentEnabled: jest.fn().mockReturnValue(true),
            classify,
          },
        },
      ],
    }).compile();

    service = module.get(IntentShadowService);
  });

  it('does not call classify when USE_LLM_INTENT is off', async () => {
    process.env.USE_LLM_INTENT = 'false';
    process.env.INTENT_SHADOW_LOG = 'true';
    process.env.NODE_ENV = 'development';

    const mod = await Test.createTestingModule({
      providers: [
        IntentShadowService,
        {
          provide: IntentRouterService,
          useValue: {
            isLlmIntentEnabled: () => false,
            classify,
          },
        },
      ],
    }).compile();
    const svc = mod.get(IntentShadowService);

    await svc.maybeLogLlmIntent({
      sessionId: 's1',
      message: 'hi',
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('calls classify when shadow logging is enabled in development', async () => {
    process.env.USE_LLM_INTENT = 'true';
    delete process.env.INTENT_SHADOW_LOG;
    process.env.NODE_ENV = 'development';

    await service.maybeLogLlmIntent({
      sessionId: 's1',
      message: 'hi',
    });
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('does not call classify when INTENT_SHADOW_LOG is false', async () => {
    process.env.USE_LLM_INTENT = 'true';
    process.env.INTENT_SHADOW_LOG = 'false';
    process.env.NODE_ENV = 'development';

    await service.maybeLogLlmIntent({
      sessionId: 's1',
      message: 'hi',
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('does not call classify when skipDuplicateClassify is true and no precomputed envelope', async () => {
    process.env.USE_LLM_INTENT = 'true';
    delete process.env.INTENT_SHADOW_LOG;
    process.env.NODE_ENV = 'development';

    await service.maybeLogLlmIntent({
      sessionId: 's1',
      message: 'hi',
      skipDuplicateClassify: true,
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('does not call classify when precomputedEnvelope is provided', async () => {
    process.env.USE_LLM_INTENT = 'true';
    delete process.env.INTENT_SHADOW_LOG;
    process.env.NODE_ENV = 'development';

    await service.maybeLogLlmIntent({
      sessionId: 's1',
      message: 'hi',
      precomputedEnvelope: {
        version: 1,
        intent: 'calendar_list',
        confidence: 0.9,
        missingSlots: [],
        slots: {},
      },
    });
    expect(classify).not.toHaveBeenCalled();
  });
});
