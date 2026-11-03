import { isConfidenceGatedIntent } from './intent/intent.types';

/**
 * Documents Phase-2 clarify policy without spinning up Nest:
 * soft `clarify` must not be treated as a canned dead-end; only gated
 * destructive intents with known-low confidence get the canned string.
 */
describe('clarify routing policy', () => {
  it('does not treat clarify as a confidence-gated tool intent', () => {
    expect(isConfidenceGatedIntent('clarify')).toBe(false);
    expect(isConfidenceGatedIntent('general_chat')).toBe(false);
  });

  it('still gates destructive email/calendar mutations', () => {
    expect(isConfidenceGatedIntent('calendar_delete')).toBe(true);
    expect(isConfidenceGatedIntent('email_draft')).toBe(true);
  });

  it('computes canned-only-when-gated-blocked the same way ChatService does', () => {
    const minToolConfidence = 0.6;

    const shouldCan =
      (intent: string, confidenceKnown: boolean, confidence: number) => {
        const isKnownLow =
          confidenceKnown && confidence < minToolConfidence;
        const isGatedToolBlocked =
          isConfidenceGatedIntent(intent as never) && isKnownLow;
        return isGatedToolBlocked;
      };

    expect(shouldCan('clarify', true, 0.2)).toBe(false);
    expect(shouldCan('general_chat', true, 0.2)).toBe(false);
    expect(shouldCan('calendar_delete', true, 0.2)).toBe(true);
    expect(shouldCan('calendar_delete', false, 0.2)).toBe(false);
  });
});
