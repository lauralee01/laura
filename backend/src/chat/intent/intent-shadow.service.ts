import { Injectable, Logger } from '@nestjs/common';
import { IntentRouterService } from './intent-router.service';
import { LlmIntentDisabledError } from './intent.types';

/**
 * When enabled, runs the LLM intent classifier and logs the envelope (routing still uses
 * ToolOrchestrator until a later batch).
 */
@Injectable()
export class IntentShadowService {
  private readonly logger = new Logger(IntentShadowService.name);

  constructor(private readonly intentRouter: IntentRouterService) {}

  /**
   * Runs only when USE_LLM_INTENT is on and INTENT_SHADOW_LOG is not "false".
   * If INTENT_SHADOW_LOG is unset, defaults to on in non-production.
   */
  isShadowLoggingEnabled(): boolean {
    if (!this.intentRouter.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_SHADOW_LOG?.trim().toLowerCase();
    if (v === 'false' || v === '0') return false;
    if (v === 'true' || v === '1') return true;
    return process.env.NODE_ENV !== 'production';
  }

  async maybeLogLlmIntent(input: {
    sessionId: string;
    message: string;
    pendingHint?: string;
    sessionTimeZone?: string;
  }): Promise<void> {
    if (!this.isShadowLoggingEnabled()) return;

    try {
      const envelope = await this.intentRouter.classify({
        userMessage: input.message,
        pendingHint: input.pendingHint,
        sessionTimeZone: input.sessionTimeZone,
      });
      this.logger.debug(
        `[intent-classify] ${JSON.stringify({
          sessionId: input.sessionId,
          intent: envelope.intent,
          confidence: envelope.confidence,
          missingSlots: envelope.missingSlots,
        })}`,
      );
    } catch (e: unknown) {
      if (e instanceof LlmIntentDisabledError) return;
      this.logger.warn(
        `[intent-classify] classify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
