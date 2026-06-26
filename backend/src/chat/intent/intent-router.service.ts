import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { buildIntentClassificationSystemPrompt } from './intent-router.prompt';
import { parseIntentEnvelopeFromModelText } from './intent-envelope.parse';
import type {
  IntentClassificationContext,
  IntentEnvelope,
} from './intent.types';

function buildClassifierUserMessage(c: IntentClassificationContext): string {
  const lines = [
    'Classify the following.',
    '',
  ];
  if (c.history && c.history.length > 0) {
    lines.push('Recent conversation:');
    for (const turn of c.history.slice(-3)) { // Only include the last 3 turns to keep it focused
      lines.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`);
    }
    lines.push('');
  }
  lines.push(`userMessage: ${c.userMessage}`);
  if (c.pendingHint?.trim()) {
    lines.push(`pendingHint: ${c.pendingHint.trim()}`);
  }
  if (c.sessionTimeZone?.trim()) {
    lines.push(`sessionTimeZone: ${c.sessionTimeZone.trim()}`);
  }
  return lines.join('\n');
}

/** Stage-1: LLM → structured {@link IntentEnvelope} used by ChatService routing/fallback logic. */
@Injectable()
export class IntentRouterService {
  constructor(private readonly llm: LlmService) {}

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
    const systemPrompt = buildIntentClassificationSystemPrompt();
    const userMessage = buildClassifierUserMessage(context);

    const raw = await this.llm.generate({
      systemPrompt,
      userMessage,
    });

    return parseIntentEnvelopeFromModelText(raw);
  }
}
