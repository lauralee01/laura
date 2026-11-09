import type { IntentEnvelope } from './intent/intent.types';
import {
  envelopeNeedsMemory,
  messageLooksLikeDurableMemory,
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

describe('messageLooksLikeDurableMemory', () => {
  it('detects preference / standing-instruction language', () => {
    expect(
      messageLooksLikeDurableMemory(
        'I prefer short answers and hate emojis',
      ),
    ).toBe(true);
    expect(
      messageLooksLikeDurableMemory(
        'From now on always schedule meetings in the morning',
      ),
    ).toBe(true);
    expect(messageLooksLikeDurableMemory('Remember that I am a founder')).toBe(
      true,
    );
  });

  it('rejects one-off questions without durable signals', () => {
    expect(
      messageLooksLikeDurableMemory('Explain recursion simply please'),
    ).toBe(false);
    expect(messageLooksLikeDurableMemory('What is on my calendar')).toBe(
      false,
    );
  });
});

describe('shouldSkipMemoryExtract', () => {
  it('skips tool intents that rarely store personal facts', () => {
    expect(shouldSkipMemoryExtract('current_datetime', 'what time is it')).toBe(
      true,
    );
    expect(
      shouldSkipMemoryExtract('web_search', 'who won the game last night'),
    ).toBe(true);
    expect(shouldSkipMemoryExtract('calendar_list', 'what is next')).toBe(
      true,
    );
    expect(shouldSkipMemoryExtract('clarify', 'do the thing')).toBe(true);
  });

  it('skips trivial turns', () => {
    expect(shouldSkipMemoryExtract('general_chat', 'hi')).toBe(true);
    expect(shouldSkipMemoryExtract('general_chat', 'ok')).toBe(true);
  });

  it('skips substantive chat without durable signals', () => {
    expect(
      shouldSkipMemoryExtract('general_chat', 'Explain recursion simply'),
    ).toBe(true);
  });

  it('allows turns that look like durable prefs or facts', () => {
    expect(
      shouldSkipMemoryExtract(
        'general_chat',
        'I prefer short answers and hate emojis',
      ),
    ).toBe(false);
    expect(
      shouldSkipMemoryExtract(
        'calendar_create',
        'Always put my meetings before noon',
      ),
    ).toBe(false);
  });
});
