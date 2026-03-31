import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { buildIntentClassificationSystemPrompt } from './intent-router.prompt';
import { parseIntentEnvelopeFromModelText } from './intent-envelope.parse';
import type {
  IntentClassificationContext,
  IntentEnvelope,
} from './intent.types';
import { LlmIntentDisabledError } from './intent.types';

function buildClassifierUserMessage(c: IntentClassificationContext): string {
  const lines = [
    'Classify the following.',
    '',
    `userMessage: ${c.userMessage}`,
  ];
  if (c.pendingHint?.trim()) {
    lines.push(`pendingHint: ${c.pendingHint.trim()}`);
  }
  if (c.sessionTimeZone?.trim()) {
    lines.push(`sessionTimeZone: ${c.sessionTimeZone.trim()}`);
  }
  return lines.join('\n');
}

/**
 * Stage-1: LLM → structured {@link IntentEnvelope}. Enabled by default (disable with
 * USE_LLM_INTENT=false) and used by ChatService routing/fallback logic.
 */
@Injectable()
export class IntentRouterService {
  constructor(private readonly llm: LlmService) {}

  /** True by default; false only when USE_LLM_INTENT is "false" or "0". */
  isLlmIntentEnabled(): boolean {
    const v = process.env.USE_LLM_INTENT?.trim().toLowerCase();
    return v !== 'false' && v !== '0';
  }

  /** True by default; false only when INTENT_ROUTE_CALENDAR_LIST is "false" or "0". */
  isCalendarListLlmRoutingEnabled(): boolean {
    if (!this.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_ROUTE_CALENDAR_LIST?.trim().toLowerCase();
    return v !== 'false' && v !== '0';
  }

  /** True by default; false only when INTENT_ROUTE_CALENDAR_MUTATIONS is "false" or "0". */
  isCalendarMutationsLlmRoutingEnabled(): boolean {
    if (!this.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_ROUTE_CALENDAR_MUTATIONS?.trim().toLowerCase();
    return v !== 'false' && v !== '0';
  }

  /** True if any calendar Stage-1 routing env is enabled. */
  isCalendarLlmRoutingEnabled(): boolean {
    return (
      this.isCalendarListLlmRoutingEnabled() ||
      this.isCalendarMutationsLlmRoutingEnabled()
    );
  }

  /** True by default; false only when INTENT_ROUTE_EMAIL is "false" or "0". */
  isEmailLlmRoutingEnabled(): boolean {
    if (!this.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_ROUTE_EMAIL?.trim().toLowerCase();
    return v !== 'false' && v !== '0';
  }

  /** Classify when any tool routing (calendar or email) is enabled. */
  isLlmToolRoutingEnabled(): boolean {
    return this.isCalendarLlmRoutingEnabled() || this.isEmailLlmRoutingEnabled();
  }

  /**
   * Minimum confidence required to run tool orchestration from Stage-1 intent.
   * Invalid or missing env values fall back to 0.6.
   */
  getToolRoutingMinConfidence(): number {
    const raw = process.env.INTENT_TOOL_MIN_CONFIDENCE;
    if (!raw) return 0.6;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return 0.6;
    if (parsed < 0) return 0;
    if (parsed > 1) return 1;
    return parsed;
  }

  async classify(context: IntentClassificationContext): Promise<IntentEnvelope> {
    if (!this.isLlmIntentEnabled()) {
      throw new LlmIntentDisabledError();
    }

    const systemPrompt = buildIntentClassificationSystemPrompt();
    const userMessage = buildClassifierUserMessage(context);

    const raw = await this.llm.generate({
      systemPrompt,
      userMessage,
    });

    return parseIntentEnvelopeFromModelText(raw);
  }
}
