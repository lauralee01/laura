import { inferWritingDeskEnvelopeFromMessage } from './writing-desk-intent-fallback';

describe('inferWritingDeskEnvelopeFromMessage', () => {
  it('maps add/save phrases to writing_desk_save', () => {
    expect(
      inferWritingDeskEnvelopeFromMessage(
        'Can you add this to my writing desk?',
      )?.intent,
    ).toBe('writing_desk_save');
    expect(
      inferWritingDeskEnvelopeFromMessage(
        'Save this to my writing desk as Cover letter',
      )?.intent,
    ).toBe('writing_desk_save');
  });

  it('maps list phrases to writing_desk_list', () => {
    expect(
      inferWritingDeskEnvelopeFromMessage("What's on my writing desk?")
        ?.intent,
    ).toBe('writing_desk_list');
  });

  it('ignores unrelated messages', () => {
    expect(
      inferWritingDeskEnvelopeFromMessage('What is on my calendar today?'),
    ).toBeNull();
    expect(
      inferWritingDeskEnvelopeFromMessage(
        'Thank you for clarifying. Since you are on OPT…',
      ),
    ).toBeNull();
  });
});
