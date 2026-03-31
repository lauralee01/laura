import { DateTime } from 'luxon';

export function getMonToSunRangeLocal(
  nowLocal: DateTime,
  _timeZone: string,
  weekOffset: number,
): { startLocal: string; endLocal: string } {
  const weekday = nowLocal.weekday;
  const daysSinceMonday = weekday - 1;
  const startOfThisWeek = nowLocal
    .minus({ days: daysSinceMonday })
    .startOf('day');

  const startLocal = startOfThisWeek
    .plus({ days: weekOffset * 7 })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");

  const endLocal = startOfThisWeek
    .plus({ days: (weekOffset + 1) * 7 })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");

  return { startLocal, endLocal };
}

/** Day window in local time, [start, next-day-start). */
export function getSingleDayRangeLocal(
  nowLocal: DateTime,
  dayOffset: number,
): { startLocal: string; endLocal: string } {
  const start = nowLocal
    .startOf('day')
    .plus({ days: dayOffset })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const end = nowLocal
    .startOf('day')
    .plus({ days: dayOffset + 1 })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
  return { startLocal: start, endLocal: end };
}

/** Window for past events: ~last year through now. */
export function getPastRangeLocal(
  nowLocal: DateTime,
): { startLocal: string; endLocal: string } {
  const startLocal = nowLocal
    .minus({ days: 365 })
    .startOf('day')
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const endLocal = nowLocal.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  return { startLocal, endLocal };
}

export function getUpcomingRangeLocal(
  nowLocal: DateTime,
): { startLocal: string; endLocal: string } {
  const startLocal = nowLocal.startOf('day').toFormat(
    "yyyy-MM-dd'T'HH:mm:ss",
  );
  const endLocal = nowLocal
    .plus({ days: 365 })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
  return { startLocal, endLocal };
}

/** Start of today through start of today+N days (use for mutation search windows). */
export function getNextDaysRangeLocal(
  nowLocal: DateTime,
  days: number,
): { startLocal: string; endLocal: string } {
  const n = Math.max(1, Math.min(60, Math.floor(days)));
  const startLocal = nowLocal.startOf('day').toFormat(
    "yyyy-MM-dd'T'HH:mm:ss",
  );
  const endLocal = nowLocal
    .plus({ days: n })
    .startOf('day')
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
  return { startLocal, endLocal };
}

export function formatMonToSunRange(
  nowLocal: DateTime,
  weekOffset: number,
): string {
  const weekday = nowLocal.weekday;
  const daysSinceMonday = weekday - 1;
  const startOfThisWeek = nowLocal
    .minus({ days: daysSinceMonday })
    .startOf('day');

  const start = startOfThisWeek.plus({ days: weekOffset * 7 });
  const endInclusive = startOfThisWeek
    .plus({ days: (weekOffset + 1) * 7 })
    .minus({ milliseconds: 1 });

  return `${start.toFormat('MMM d, yyyy')} – ${endInclusive.toFormat('MMM d, yyyy')}`;
}

export function describeDayWindow(nowLocal: DateTime, dayOffset: number): string {
  if (dayOffset === 0) return 'today';
  if (dayOffset === 1) return 'tomorrow';
  if (dayOffset === -1) return 'yesterday';
  return nowLocal.plus({ days: dayOffset }).toFormat('ccc, MMM d, yyyy');
}

/** Label for mode next_days (spanDays calendar days from today’s start). */
export function describeNextDaysSpan(spanDays: number): string {
  const n = Math.max(1, Math.floor(spanDays));
  if (n === 1) return 'today';
  if (n === 2) return 'today and tomorrow';
  return `the next ${n} days`;
}

/**
 * Full calendar month in local time: [start of month, start of next month).
 * `monthOffset` 0 = this month, 1 = next, -1 = last.
 */
export function getCalendarMonthRangeLocal(
  nowLocal: DateTime,
  monthOffset: number,
): { startLocal: string; endLocal: string } {
  const start = nowLocal.startOf('month').plus({ months: monthOffset });
  const end = start.plus({ months: 1 });
  return {
    startLocal: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    endLocal: end.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
  };
}

export function formatMonthWindowLabel(
  nowLocal: DateTime,
  monthOffset: number,
): string {
  return nowLocal
    .startOf('month')
    .plus({ months: monthOffset })
    .toFormat('MMMM yyyy');
}

/**
 * Full calendar year in local time: [Jan 1 00:00, next Jan 1 00:00).
 * `yearOffset` 0 = this year, 1 = next, -1 = last.
 */
export function getCalendarYearRangeLocal(
  nowLocal: DateTime,
  yearOffset: number,
): { startLocal: string; endLocal: string } {
  const start = nowLocal.startOf('year').plus({ years: yearOffset });
  const end = start.plus({ years: 1 });
  return {
    startLocal: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    endLocal: end.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
  };
}

export function formatYearWindowLabel(
  nowLocal: DateTime,
  yearOffset: number,
): string {
  return nowLocal
    .startOf('year')
    .plus({ years: yearOffset })
    .toFormat('yyyy');
}
