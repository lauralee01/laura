import { getListDayOffset, getSlotListMode } from './tool-orchestrator.intent-slots';
import type { IntentEnvelope } from '../intent/intent.types';

function envelope(slots: Record<string, unknown>): IntentEnvelope {
  return {
    version: 1,
    intent: 'calendar_list',
    confidence: 0.9,
    confidenceKnown: true,
    missingSlots: [],
    slots,
  };
}

describe('getSlotListMode', () => {
  it('uses flat mode when present', () => {
    expect(getSlotListMode(envelope({ mode: 'day', dayOffset: 0 }))).toBe(
      'day',
    );
  });

  it('infers day from dayOffset when mode is missing (today bug)', () => {
    expect(getSlotListMode(envelope({ dayOffset: 0 }))).toBe('day');
  });

  it('reads nested day object from prompt-shaped slots', () => {
    expect(
      getSlotListMode(
        envelope({ day: { mode: 'day', dayOffset: 0 } }),
      ),
    ).toBe('day');
  });

  it('defaults to upcoming only when no mode clues exist', () => {
    expect(getSlotListMode(envelope({}))).toBe('upcoming');
  });
});

describe('getListDayOffset', () => {
  it('reads nested dayOffset', () => {
    expect(
      getListDayOffset(
        envelope({ day: { mode: 'day', dayOffset: 1 } }),
      ),
    ).toBe(1);
  });
});
