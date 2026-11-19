import {
  INTENT_CLASSIFICATION_SCHEMA_VERSION,
  type IntentEnvelope,
} from './intent/intent.types';

/**
 * When Stage-1 classify fails (e.g. MAX_TOKENS), still route obvious
 * Writing desk requests so saves are not dropped into general_chat.
 */
export function inferWritingDeskEnvelopeFromMessage(
  message: string,
): IntentEnvelope | null {
  const m = message.trim();
  if (!m) {
    return null;
  }

  const mentionsDesk =
    /\bwriting desk\b/i.test(m) ||
    /\bsaved (writing )?drafts?\b/i.test(m);
  if (!mentionsDesk) {
    return null;
  }

  const wantsList =
    /\b(show|list|what'?s on|whats on|open)\b/i.test(m) &&
    !/\b(add|save|put)\b/i.test(m);
  if (wantsList) {
    return envelope('writing_desk_list');
  }

  if (/\b(add|save|put)\b/i.test(m)) {
    return envelope('writing_desk_save');
  }

  return null;
}

function envelope(
  intent: 'writing_desk_save' | 'writing_desk_list',
): IntentEnvelope {
  return {
    version: INTENT_CLASSIFICATION_SCHEMA_VERSION,
    intent,
    confidence: 0.85,
    confidenceKnown: true,
    missingSlots: [],
    slots: {},
  };
}
