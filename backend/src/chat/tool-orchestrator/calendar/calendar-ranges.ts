import { DateTime } from 'luxon';

type CalendarRange = {
  startLocal: string;
  endLocal: string;
};

const LOCAL_API_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

function toLocalApiString(dt: DateTime): string {
  return dt.toFormat(LOCAL_API_FORMAT);
}

function startOfMondayWeek(nowLocal: DateTime): DateTime {
  return nowLocal.minus({ days: nowLocal.weekday - 1 }).startOf('day');
}

export function getMonToSunRangeLocal(
  nowLocal: DateTime,
  weekOffset: number,
): CalendarRange {
  const start = startOfMondayWeek(nowLocal).plus({ days: weekOffset * 7 });
  const end = start.plus({ days: 7 });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function getSingleDayRangeLocal(
  nowLocal: DateTime,
  dayOffset: number,
): CalendarRange {
  const start = nowLocal.startOf('day').plus({ days: dayOffset });
  const end = start.plus({ days: 1 });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function getPastRangeLocal(nowLocal: DateTime): CalendarRange {
  return {
    startLocal: toLocalApiString(nowLocal.minus({ days: 365 }).startOf('day')),
    endLocal: toLocalApiString(nowLocal),
  };
}

export function getUpcomingRangeLocal(nowLocal: DateTime): CalendarRange {
  return {
    startLocal: toLocalApiString(nowLocal.startOf('day')),
    endLocal: toLocalApiString(nowLocal.plus({ days: 365 })),
  };
}

export function getNextDaysRangeLocal(
  nowLocal: DateTime,
  days: number,
): CalendarRange {
  const n = Math.max(1, Math.min(60, Math.floor(days)));
  const start = nowLocal.startOf('day');
  const end = start.plus({ days: n });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function getCalendarMonthRangeLocal(
  nowLocal: DateTime,
  monthOffset: number,
): CalendarRange {
  const start = nowLocal.startOf('month').plus({ months: monthOffset });
  const end = start.plus({ months: 1 });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function getCalendarYearRangeLocal(
  nowLocal: DateTime,
  yearOffset: number,
): CalendarRange {
  const start = nowLocal.startOf('year').plus({ years: yearOffset });
  const end = start.plus({ years: 1 });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function formatMonToSunRange(
  nowLocal: DateTime,
  weekOffset: number,
): string {
  const start = startOfMondayWeek(nowLocal).plus({ days: weekOffset * 7 });
  const endInclusive = start.plus({ days: 7 }).minus({ milliseconds: 1 });

  return `${start.toFormat('MMM d, yyyy')} – ${endInclusive.toFormat('MMM d, yyyy')}`;
}

export function describeDayWindow(nowLocal: DateTime, dayOffset: number): string {
  if (dayOffset === 0) return 'today';
  if (dayOffset === 1) return 'tomorrow';
  if (dayOffset === -1) return 'yesterday';

  return nowLocal.plus({ days: dayOffset }).toFormat('ccc, MMM d, yyyy');
}

export function describeNextDaysSpan(spanDays: number): string {
  const n = Math.max(1, Math.floor(spanDays));

  if (n === 1) return 'today';
  if (n === 2) return 'today and tomorrow';

  return `the next ${n} days`;
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

export function formatYearWindowLabel(
  nowLocal: DateTime,
  yearOffset: number,
): string {
  return nowLocal
    .startOf('year')
    .plus({ years: yearOffset })
    .toFormat('yyyy');
}