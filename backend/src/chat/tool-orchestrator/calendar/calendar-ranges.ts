import { DateTime } from 'luxon';

type CalendarRange = {
  startLocal: string;
  endLocal: string;
};

const LOCAL_API_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";
const MAX_NEXT_DAYS = 60;

function toLocalApiString(dateTime: DateTime): string {
  return dateTime.toFormat(LOCAL_API_FORMAT);
}

function normalizeDayCount(days: number): number {
  return Math.max(1, Math.min(MAX_NEXT_DAYS, Math.floor(days)));
}

function startOfMondayWeek(nowLocal: DateTime): DateTime {
  return nowLocal
    .minus({ days: nowLocal.weekday - 1 })
    .startOf('day');
}

export function getMonToSunRangeLocal(
  nowLocal: DateTime,
  weekOffset: number,
): CalendarRange {
  const start = startOfMondayWeek(nowLocal).plus({
    weeks: weekOffset,
  });
  const end = start.plus({ weeks: 1 });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(end),
  };
}

export function getSingleDayRangeLocal(
  nowLocal: DateTime,
  dayOffset: number,
): CalendarRange {
  const start = nowLocal
    .startOf('day')
    .plus({ days: dayOffset });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(start.plus({ days: 1 })),
  };
}

export function getPastRangeLocal(
  nowLocal: DateTime,
): CalendarRange {
  return {
    startLocal: toLocalApiString(
      nowLocal.minus({ days: 365 }).startOf('day'),
    ),
    endLocal: toLocalApiString(nowLocal),
  };
}

export function getUpcomingRangeLocal(
  nowLocal: DateTime,
): CalendarRange {
  return {
    startLocal: toLocalApiString(nowLocal),
    endLocal: toLocalApiString(nowLocal.plus({ days: 365 })),
  };
}

export function getNextDaysRangeLocal(
  nowLocal: DateTime,
  days: number,
): CalendarRange {
  const normalizedDays = normalizeDayCount(days);
  const start = nowLocal.startOf('day');

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(
      start.plus({ days: normalizedDays }),
    ),
  };
}

export function getCalendarMonthRangeLocal(
  nowLocal: DateTime,
  monthOffset: number,
): CalendarRange {
  const start = nowLocal
    .startOf('month')
    .plus({ months: monthOffset });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(start.plus({ months: 1 })),
  };
}

export function getCalendarYearRangeLocal(
  nowLocal: DateTime,
  yearOffset: number,
): CalendarRange {
  const start = nowLocal
    .startOf('year')
    .plus({ years: yearOffset });

  return {
    startLocal: toLocalApiString(start),
    endLocal: toLocalApiString(start.plus({ years: 1 })),
  };
}

export function formatMonToSunRange(
  nowLocal: DateTime,
  weekOffset: number,
): string {
  const start = startOfMondayWeek(nowLocal).plus({
    weeks: weekOffset,
  });
  const end = start.plus({ days: 6 });

  return (
    `${start.toFormat('MMM d, yyyy')} – ` +
    end.toFormat('MMM d, yyyy')
  );
}

export function describeDayWindow(
  nowLocal: DateTime,
  dayOffset: number,
): string {
  if (dayOffset === 0) return 'today';
  if (dayOffset === 1) return 'tomorrow';
  if (dayOffset === -1) return 'yesterday';

  return nowLocal
    .plus({ days: dayOffset })
    .toFormat('ccc, MMM d, yyyy');
}

export function describeNextDaysSpan(
  spanDays: number,
): string {
  const normalizedDays = normalizeDayCount(spanDays);

  if (normalizedDays === 1) return 'today';
  if (normalizedDays === 2) return 'today and tomorrow';

  return `the next ${normalizedDays} days`;
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