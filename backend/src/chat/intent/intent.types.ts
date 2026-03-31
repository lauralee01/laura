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
export const INTENT_CLASSIFICATION_PROMPT_VERSION = 'batch-g-v2';

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
] as const;

export type IntentId = (typeof INTENT_IDS)[number];

export type IntentEnvelope = {
  version: typeof INTENT_CLASSIFICATION_SCHEMA_VERSION;
  intent: IntentId;
  /** 0–1; use for future gating (Batch B+). */
  confidence: number;
  /** Slot names still required before execution (e.g. timeZone). */
  missingSlots: string[];
  /** Intent-specific payload; validated per intent in later batches. */
  slots: Record<string, unknown>;
};

/** Input to Stage-1 classify (expand when pending state is serialized for the model). */
export type IntentClassificationContext = {
  userMessage: string;
  /** Short hint, e.g. "Waiting for email send confirmation" */
  pendingHint?: string;
  /** Session default IANA zone if already known */
  sessionTimeZone?: string;
};

export class IntentEnvelopeParseError extends Error {
  readonly code = 'INTENT_ENVELOPE_PARSE';

  constructor(message: string) {
    super(message);
    this.name = 'IntentEnvelopeParseError';
  }
}
