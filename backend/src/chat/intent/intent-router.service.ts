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
 * Stage-1: LLM → structured {@link IntentEnvelope}. Gated by USE_LLM_INTENT (default off).
 * Not wired into {@link ChatService} until Batch B+; call only when enabled or in tests.
 */
@Injectable()
export class IntentRouterService {
  constructor(private readonly llm: LlmService) {}

  /** True when USE_LLM_INTENT is "true" or "1". */
  isLlmIntentEnabled(): boolean {
    const v = process.env.USE_LLM_INTENT?.trim().toLowerCase();
    return v === 'true' || v === '1';
  }

  /** When true with USE_LLM_INTENT, ChatService routes `calendar_list` via Stage-1 first. */
  isCalendarListLlmRoutingEnabled(): boolean {
    if (!this.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_ROUTE_CALENDAR_LIST?.trim().toLowerCase();
    return v === 'true' || v === '1';
  }

  /** When true with USE_LLM_INTENT, ChatService routes create/update/delete calendar intents first. */
  isCalendarMutationsLlmRoutingEnabled(): boolean {
    if (!this.isLlmIntentEnabled()) return false;
    const v = process.env.INTENT_ROUTE_CALENDAR_MUTATIONS?.trim().toLowerCase();
    return v === 'true' || v === '1';
  }

  /** True if any calendar Stage-1 routing env is enabled. */
  isCalendarLlmRoutingEnabled(): boolean {
    return (
      this.isCalendarListLlmRoutingEnabled() ||
      this.isCalendarMutationsLlmRoutingEnabled()
    );
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
