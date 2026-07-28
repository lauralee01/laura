import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { buildIntentClassificationSystemPrompt } from './intent-router.prompt';
import { parseIntentEnvelopeFromModelText } from './intent-envelope.parse';
import type {
  IntentClassificationContext,
  IntentEnvelope,
} from './intent.types';

function buildClassifierUserMessage(c: IntentClassificationContext): string {
  const lines = ['Classify the following.', ''];
  if (c.history && c.history.length > 0) {
    lines.push('Recent conversation:');
    for (const turn of c.history.slice(-3)) {
      // Only include the last 3 turns to keep it focused
      lines.push(
        `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`,
      );
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

/** Fast-path rule classifier to bypass expensive LLM latency for obvious inputs */
function tryFastPathClassification(
  c: IntentClassificationContext,
): IntentEnvelope | null {
  // If there's a pending hint or conversation history, let the LLM handle context resolution
  if (c.pendingHint?.trim() || (c.history && c.history.length > 0)) {
    return null;
  }

  const msg = c.userMessage.trim().toLowerCase();

  // Simple greetings
  if (
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|howdy)[!.]?$/i.test(
      msg,
    )
  ) {
    return {
      version: 1,
      intent: 'general_chat',
      confidence: 0.99,
      missingSlots: [],
      slots: {},
    };
  }

  // Simple thanks
  if (/^(thanks|thank you|thanks!|thank you!|thx)$/i.test(msg)) {
    return {
      version: 1,
      intent: 'general_chat',
      confidence: 0.99,
      missingSlots: [],
      slots: {},
    };
  }

  // Current time & date queries
  if (
    /^(what time is it\??|what's the time\??|what is today's date\??|what date is today\??|what day is it\??)$/i.test(
      msg,
    )
  ) {
    return {
      version: 1,
      intent: 'current_datetime',
      confidence: 0.99,
      missingSlots: [],
      slots: {},
    };
  }

  return null;
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

  async classify(
    context: IntentClassificationContext,
  ): Promise<IntentEnvelope> {
    // 1. FAST PATH: Check deterministic rules to bypass LLM latency
    const fastPathResult = tryFastPathClassification(context);
    if (fastPathResult) {
      return fastPathResult;
    }

    // 2. LLM PATH: Optimized JSON mode with low temperature & token caps
    const systemPrompt = buildIntentClassificationSystemPrompt();
    const userMessage = buildClassifierUserMessage(context);

    const raw = await this.llm.generate({
      systemPrompt,
      userMessage,
      temperature: 0.1,
      maxOutputTokens: 250,
      responseMimeType: 'application/json',
    });

    return parseIntentEnvelopeFromModelText(raw);
  }
}
