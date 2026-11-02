import {
  buildGroundedDateTimeContext,
  formatLocalDateIso,
  resolveSessionTimeZone,
} from './datetime-context';

describe('datetime-context', () => {
  it('falls back when session timezone is missing', () => {
    expect(resolveSessionTimeZone(null)).toBe('America/Chicago');
    expect(resolveSessionTimeZone('  ')).toBe('America/Chicago');
    expect(resolveSessionTimeZone('Europe/London')).toBe('Europe/London');
  });

  it('formats a local ISO date in the given zone', () => {
    const at = new Date('2026-06-15T18:00:00.000Z');
    expect(formatLocalDateIso('UTC', at)).toBe('2026-06-15');
  });

  it('includes grounded today / timezone in the chat context block', () => {
    const block = buildGroundedDateTimeContext('America/New_York');
    expect(block).toContain('IANA timezone: America/New_York');
    expect(block).toContain("Today's date:");
    expect(block).toContain('Current local datetime:');
    expect(block).toMatch(/days are left in the year/i);
  });
});
