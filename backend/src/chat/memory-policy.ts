import type { IntentEnvelope, IntentId } from './intent/intent.types';

/**
 * Stage-1 decides whether personal memory is relevant for this turn.
 * Missing / non-boolean slots default to false (opt-in retrieve).
 */
export function envelopeNeedsMemory(
  envelope: IntentEnvelope | undefined,
): boolean {
  const value = envelope?.slots?.needsMemory;

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return false;
}

/**
 * Tool / system turns that almost never introduce durable personal facts.
 * Skip the extract LLM entirely for these intents.
 */
const SKIP_EXTRACT_INTENTS = new Set<IntentId>([
  'current_datetime',
  'web_search',
  'calendar_list',
  'calendar_delete',
  'set_timezone',
  'pending_confirm',
  'pending_cancel',
  'clarify',
  'email_send_confirm',
  'email_draft_revise',
]);

/**
 * Cheap gate before the extract LLM: only spend a generate() when the
 * message looks like it might contain a durable preference or fact.
 * Aligns with memory-persistence extractor rules (prefs / roles / standing instructions).
 */
export function messageLooksLikeDurableMemory(message: string): boolean {
  const clean = message.trim().toLowerCase();
  if (clean.length < 12) {
    return false;
  }

  return (
    /\b(prefer|preference|always|never|from now on|going forward)\b/.test(
      clean,
    ) ||
    /\b(remember (that|i|my|to)|don'?t forget|keep in mind)\b/.test(clean) ||
    /\b(i(?:'m| am) (a|an|the)\b|i work as|my (job|role|title) is)\b/.test(
      clean,
    ) ||
    /\b(my name is|call me|i(?:'m| am) based|i live in)\b/.test(clean) ||
    /\b(time\s*zone|timezone)\b/.test(clean) ||
    /\b(be (more|less)|keep (it |answers? |replies? )?(short|brief|concise|detailed|long))\b/.test(
      clean,
    ) ||
    /\bi (hate|love|dislike|want you to|need you to)\b/.test(clean)
  );
}

/**
 * Skip the extract LLM when the turn cannot produce durable personal facts.
 */
export function shouldSkipMemoryExtract(
  intent: IntentId | undefined,
  message: string,
): boolean {
  if (intent && SKIP_EXTRACT_INTENTS.has(intent)) {
    return true;
  }

  const clean = message.trim().toLowerCase();
  if (clean.length < 4) {
    return true;
  }

  if (
    /^(hi|hello|hey|greetings|thanks|thank you|thx|ok|okay|yes|no|sure|cool|bye|goodbye|got it|sounds good)[!.]?$/i.test(
      clean,
    )
  ) {
    return true;
  }

  return !messageLooksLikeDurableMemory(message);
}
