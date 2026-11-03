import type { IntentEnvelope } from './intent/intent.types';
import {
  envelopeNeedsMemory,
  shouldSkipMemoryExtract,
} from './memory-policy';

function envelope(
  slots: Record<string, unknown>,
): IntentEnvelope {
  return {
    version: 1,
    intent: 'general_chat',
    confidence: 0.9,
    confidenceKnown: true,
    missingSlots: [],
    slots,
  };
}

describe('envelopeNeedsMemory', () => {
  it('is true only when the slot is boolean true', () => {
    expect(envelopeNeedsMemory(envelope({ needsMemory: true }))).toBe(true);
    expect(envelopeNeedsMemory(envelope({ needsMemory: false }))).toBe(false);
    expect(envelopeNeedsMemory(envelope({}))).toBe(false);
    expect(envelopeNeedsMemory(undefined)).toBe(false);
  });

  it('accepts string "true" from loose model output', () => {
    expect(envelopeNeedsMemory(envelope({ needsMemory: 'true' }))).toBe(true);
    expect(envelopeNeedsMemory(envelope({ needsMemory: 'false' }))).toBe(
      false,
    );
  });
});

describe('shouldSkipMemoryExtract', () => {
  it('skips current_datetime and trivial turns', () => {
    expect(shouldSkipMemoryExtract('current_datetime', 'what time is it')).toBe(
      true,
    );
    expect(shouldSkipMemoryExtract('general_chat', 'hi')).toBe(true);
    expect(shouldSkipMemoryExtract('general_chat', 'ok')).toBe(true);
  });

  it('allows substantive general chat', () => {
    expect(
      shouldSkipMemoryExtract(
        'general_chat',
        'I prefer short answers and hate emojis',
      ),
    ).toBe(false);
  });
});
