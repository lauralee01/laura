import { mergeTimeOnlyUpdateOntoEventDay } from './tool-orchestrator.calendar-update-merge';

describe('mergeTimeOnlyUpdateOntoEventDay', () => {
  const tz = 'America/Chicago';

  it('moves clock time onto the matched event day when the model used today', () => {
    const r = mergeTimeOnlyUpdateOntoEventDay({
      userMessage: 'Move Coffee with Toyosi to 4pm',
      timeZone: tz,
      eventStartLocalIso: '2026-04-02T15:00:00',
      eventEndLocalIso: '2026-04-02T16:00:00',
      newStart: '2026-04-01T16:00:00',
      newEnd: '2026-04-01T17:00:00',
    });
    expect(r).not.toBeNull();
    expect(r!.start).toBe('2026-04-02T16:00:00');
    expect(r!.end).toBe('2026-04-02T17:00:00');
  });

  it('does not merge when the user names a date', () => {
    const r = mergeTimeOnlyUpdateOntoEventDay({
      userMessage: 'Move it to 4pm tomorrow',
      timeZone: tz,
      eventStartLocalIso: '2026-04-02T15:00:00',
      eventEndLocalIso: '2026-04-02T16:00:00',
      newStart: '2026-04-02T16:00:00',
      newEnd: '2026-04-02T17:00:00',
    });
    expect(r).toBeNull();
  });

  it('does not merge when the model already used the event day', () => {
    const r = mergeTimeOnlyUpdateOntoEventDay({
      userMessage: 'Move Coffee with Toyosi to 4pm',
      timeZone: tz,
      eventStartLocalIso: '2026-04-02T15:00:00',
      eventEndLocalIso: '2026-04-02T16:00:00',
      newStart: '2026-04-02T16:00:00',
      newEnd: '2026-04-02T17:00:00',
    });
    expect(r).toBeNull();
  });
});
