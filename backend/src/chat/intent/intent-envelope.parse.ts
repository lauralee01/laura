import { safeParseJsonObject } from '../tool-orchestrator/tool-orchestrator.utils';
import type { IntentEnvelope, IntentId } from './intent.types';
import {
  INTENT_CLASSIFICATION_SCHEMA_VERSION,
  INTENT_IDS,
  IntentEnvelopeParseError,
} from './intent.types';

function isIntentId(value: string): value is IntentId {
  return (INTENT_IDS as readonly string[]).includes(value);
}

/** Strips ``` / ```json fences and leading noise so Gemini markdown output still parses. */
function normalizeClassifierRawText(raw: string): string {
  let t = raw.trim();
  const fenced = t.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/im);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  return t.trim();
}

/**
 * Validates model output into `{ version, intent, confidence, missingSlots, slots }`.
 * Throws IntentEnvelopeParseError if the shape is invalid.
 */
export function parseIntentEnvelopeFromModelText(raw: string): IntentEnvelope {
  const normalized = normalizeClassifierRawText(raw);
  const obj = safeParseJsonObject(normalized);
  if (!obj) {
    throw new IntentEnvelopeParseError(
      'Model did not return parseable JSON (object).',
    );
  }

  const versionUnknown = obj['version'];
  if (versionUnknown !== INTENT_CLASSIFICATION_SCHEMA_VERSION) {
    throw new IntentEnvelopeParseError(
      `Expected version ${INTENT_CLASSIFICATION_SCHEMA_VERSION}, got ${String(versionUnknown)}.`,
    );
  }

  const intentUnknown = obj['intent'];
  if (typeof intentUnknown !== 'string' || !isIntentId(intentUnknown)) {
    throw new IntentEnvelopeParseError(
      `Invalid or unknown intent: ${String(intentUnknown)}.`,
    );
  }

  let confidence = 0.5;
  const c = obj['confidence'];
  if (c !== undefined) {
    if (typeof c !== 'number' || Number.isNaN(c) || c < 0 || c > 1) {
      throw new IntentEnvelopeParseError(
        'confidence must be a number between 0 and 1.',
      );
    }
    confidence = c;
  }

  let missingSlots: string[] = [];
  const m = obj['missingSlots'];
  if (m !== undefined) {
    if (!Array.isArray(m) || !m.every((x) => typeof x === 'string')) {
      throw new IntentEnvelopeParseError(
        'missingSlots must be an array of strings.',
      );
    }
    missingSlots = m;
  }

  let slots: Record<string, unknown> = {};
  const s = obj['slots'];
  if (s !== undefined) {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      throw new IntentEnvelopeParseError('slots must be a plain object.');
    }
    slots = s as Record<string, unknown>;
  }

  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent: intentUnknown,
    confidence,
    missingSlots,
    slots,
  };
}
