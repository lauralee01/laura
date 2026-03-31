import { Injectable, Logger } from '@nestjs/common';
import { IntentRouterService } from './intent-router.service';
import type { IntentEnvelope } from './intent.types';

/**
 * Runs the LLM intent classifier and logs the envelope.
 */
@Injectable()
export class IntentShadowService {
  private readonly logger = new Logger(IntentShadowService.name);

  constructor(private readonly intentRouter: IntentRouterService) {}

  /** Runs when INTENT_SHADOW_LOG is not "false" (defaults on in non-production). */
  isShadowLoggingEnabled(): boolean {
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
    /** When set (e.g. after routing classify), skips a second Gemini call. */
    precomputedEnvelope?: IntentEnvelope;
    /**
     * When true, do not call classify again (e.g. routing classify already failed).
     * Avoids duplicate API calls and noisy WARN logs.
     */
    skipDuplicateClassify?: boolean;
  }): Promise<void> {
    if (!this.isShadowLoggingEnabled()) return;

    if (
      !input.precomputedEnvelope &&
      input.skipDuplicateClassify
    ) {
      return;
    }

    try {
      const envelope =
        input.precomputedEnvelope ??
        (await this.intentRouter.classify({
          userMessage: input.message,
          pendingHint: input.pendingHint,
          sessionTimeZone: input.sessionTimeZone,
        }));
      this.logger.debug(
        `[intent-classify] ${JSON.stringify({
          sessionId: input.sessionId,
          intent: envelope.intent,
          confidence: envelope.confidence,
          missingSlots: envelope.missingSlots,
        })}`,
      );
    } catch (e: unknown) {
      this.logger.warn(
        `[intent-classify] classify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
