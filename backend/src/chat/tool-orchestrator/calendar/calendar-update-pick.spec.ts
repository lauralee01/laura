import { looksLikeBareEventPick } from './calendar-event-pick';

describe('looksLikeBareEventPick', () => {
  it('treats numbered replies as bare picks', () => {
    expect(looksLikeBareEventPick('1')).toBe(true);
    expect(looksLikeBareEventPick('2.')).toBe(true);
    expect(looksLikeBareEventPick(' 12) ')).toBe(true);
  });

  it('allows extract when the reply adds update details', () => {
    expect(looksLikeBareEventPick('move option 1 to 4pm')).toBe(false);
    expect(looksLikeBareEventPick('1 to 4pm')).toBe(false);
  });
});
