import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { buildIntentClassificationSystemPrompt } from './intent-router.prompt';
import { parseIntentEnvelopeFromModelText } from './intent-envelope.parse';
import type {
  IntentClassificationContext,
  IntentEnvelope,
} from './intent.types';

function buildClassifierUserMessage(
  context: IntentClassificationContext,
): string {
  const lines: string[] = [
    'Classify the user request using the available conversation context.',
    '',
  ];

  /*
   * Include enough recent conversation for short follow-ups such as:
   *
   * "yes"
   * "do that"
   * "check again"
   * "what about tomorrow?"
   * "send it"
   *
   * Six turns gives the classifier roughly three recent
   * user/assistant exchanges without making the prompt unnecessarily large.
   */
  if (context.history?.length) {
    lines.push('Recent conversation:');

    for (const turn of context.history.slice(-6)) {
      const speaker =
        turn.role === 'user' ? 'User' : 'Assistant';

      /*
       * Cap turn size so the classifier does not echo huge draft bodies
       * into slots and blow MAX_TOKENS on the tiny IntentEnvelope budget.
       */
      lines.push(`${speaker}: ${truncateForClassifier(turn.content)}`);
    }

    lines.push('');
  }

  lines.push('Current user message:');
  lines.push(context.userMessage);

  if (context.pendingHint?.trim()) {
    lines.push('');
    lines.push('Active pending context:');
    lines.push(context.pendingHint.trim());
  }

  if (context.sessionTimeZone?.trim()) {
    lines.push('');
    lines.push(
      `User session timezone: ${context.sessionTimeZone.trim()}`,
    );
  }

  return lines.join('\n');
}

/**
 * Stage 1 intent classification.
 *
 * Natural-language intent inference belongs to the LLM classifier.
 * This service supplies conversation/session context and validates
 * the structured result before ChatService performs any tool action.
 */
@Injectable()
export class IntentRouterService {
  constructor(private readonly llm: LlmService) { }

  /**
   * Minimum confidence required before ChatService performs
   * tool orchestration from the classifier result.
   */
  getToolRoutingMinConfidence(): number {
    const raw =
      process.env.INTENT_TOOL_MIN_CONFIDENCE?.trim();

    if (!raw) {
      return 0.6;
    }

    const parsed = Number(raw);

    if (!Number.isFinite(parsed)) {
      return 0.6;
    }

    return Math.min(1, Math.max(0, parsed));
  }

  async classify(
    context: IntentClassificationContext,
  ): Promise<IntentEnvelope> {
    const systemPrompt =
      buildIntentClassificationSystemPrompt();

    const userMessage =
      buildClassifierUserMessage(context);

    const classifierModel =
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-2.5-flash-lite';

    const raw = await this.llm.generate({
      model: classifierModel,
      systemPrompt,
      userMessage,

      /*
       * Classification should be deterministic rather than creative.
       */
      temperature: 0,

      /*
       * IntentEnvelope is small, but titles / short slot strings still need
       * headroom. Keep draft bodies out of slots (see prompt) so this stays
       * well under the cap — 250 was truncating and failing the whole route.
       */
      maxOutputTokens: 512,

      /*
       * Thinking tokens eat the output budget and delay JSON. Router
       * accuracy comes from the prompt + schema, not extended thinking.
       */
      thinkingBudget: 0,

      responseMimeType: 'application/json',
    });

    return parseIntentEnvelopeFromModelText(raw);
  }
}

const CLASSIFIER_HISTORY_TURN_MAX = 400;

function truncateForClassifier(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= CLASSIFIER_HISTORY_TURN_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, CLASSIFIER_HISTORY_TURN_MAX - 1).trimEnd()}…`;
}