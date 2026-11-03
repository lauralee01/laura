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
 * Skip the extract LLM when the turn cannot produce durable personal facts.
 */
export function shouldSkipMemoryExtract(
  intent: IntentId | undefined,
  message: string,
): boolean {
  if (intent === 'current_datetime') {
    return true;
  }

  const clean = message.trim().toLowerCase();
  if (clean.length < 4) {
    return true;
  }

  return /^(hi|hello|hey|greetings|thanks|thank you|thx|ok|okay|yes|no|sure|cool|bye|goodbye|got it|sounds good)[!.]?$/i.test(
    clean,
  );
}
