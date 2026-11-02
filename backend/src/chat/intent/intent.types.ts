/**
 * Stage-1 classifier output (single source of truth for LLM-interpreted routing).
 * * what the LLM must output in JSON format
 * * {
 *   "version": 1,
 *   "intent": "<one of the intents below>",
 *   "confidence": <number between 0 and 1>,
 *   "missingSlots": <array of string slot names still needed, or []>,
 *   "slots": <object with optional keys you can infer; use {} if none>
 * }
 * Extend `slots` keys as batches wire more tools; `intent` enum grows with product.
 */

export const INTENT_CLASSIFICATION_SCHEMA_VERSION = 1 as const;

/** Prompt / parser version for logs and regression tests (increment when JSON shape changes). */
export const INTENT_CLASSIFICATION_PROMPT_VERSION = 'batch-g-v6';

export const INTENT_IDS = [
  'general_chat',
  'calendar_list',
  'calendar_create',
  'calendar_update',
  'calendar_delete',
  'email_draft',
  'email_send_confirm',
  'email_draft_revise',
  'pending_confirm',
  'pending_cancel',
  'set_timezone',
  'clarify',
  'current_datetime',
  'web_search',
] as const;

export type IntentId = (typeof INTENT_IDS)[number];

export type IntentEnvelope = {
  version: typeof INTENT_CLASSIFICATION_SCHEMA_VERSION;
  intent: IntentId;
  /** 0–1 when the model provided a score; ignored for gating when confidenceKnown is false. */
  confidence: number;
  /**
   * False when the model omitted confidence. Missing confidence must not be
   * treated the same as a real low score (parser used to default to 0.5).
   */
  confidenceKnown: boolean;
  /** Slot names still required before execution (e.g. timeZone). */
  missingSlots: string[];
  /** Intent-specific payload; validated per intent in later batches. */
  slots: Record<string, unknown>;
};

/** Tool intents that must not run when confidence is known-low. */
export const CONFIDENCE_GATED_INTENTS = [
  'calendar_create',
  'calendar_update',
  'calendar_delete',
  'email_draft',
  'email_send_confirm',
  'email_draft_revise',
] as const satisfies readonly IntentId[];

export type ConfidenceGatedIntent =
  (typeof CONFIDENCE_GATED_INTENTS)[number];

export function isConfidenceGatedIntent(
  intent: IntentId,
): intent is ConfidenceGatedIntent {
  return (CONFIDENCE_GATED_INTENTS as readonly string[]).includes(
    intent,
  );
}

/** Input to Stage-1 classify (expand when pending state is serialized for the model). */
export type IntentClassificationContext = {
  userMessage: string;
  /** Short hint, e.g. "Waiting for email send confirmation" */
  pendingHint?: string;
  /** Session default IANA zone if already known */
  sessionTimeZone?: string;
  /** Prior conversation turns to provide context for intent classification. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export class IntentEnvelopeParseError extends Error {
  readonly code = 'INTENT_ENVELOPE_PARSE';

  constructor(message: string) {
    super(message);
    this.name = 'IntentEnvelopeParseError';
  }
}
