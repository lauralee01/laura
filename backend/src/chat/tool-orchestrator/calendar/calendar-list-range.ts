import { DateTime } from 'luxon';
import {
  getCalendarMonthRangeLocal,
  getCalendarYearRangeLocal,
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
  getPastRangeLocal,
  getSingleDayRangeLocal,
  getUpcomingRangeLocal,
} from './calendar-ranges';
import type { PendingCalendarListPayload } from '../tool-orchestrator.types';

type CalendarRange = {
  startLocal: string;
  endLocal: string;
};

/**
 * Maps a stored list payload + “now” in the user’s zone to API [start, end) window strings.
 * Used by live list and by “user just gave timezone” resume paths.
 */
export function resolvePendingListRange(
  nowLocal: DateTime,
  pendingListRequest: PendingCalendarListPayload,
): CalendarRange {
  if (pendingListRequest.mode === 'week') {
    console.log('weekOffset', pendingListRequest.weekOffset);
    return getMonToSunRangeLocal(
      nowLocal,
      pendingListRequest.weekOffset ?? 0,
    );
  }

  if (pendingListRequest.mode === 'month') {
    return getCalendarMonthRangeLocal(
      nowLocal,
      pendingListRequest.monthOffset ?? 0,
    );
  }

  if (pendingListRequest.mode === 'year') {
    return getCalendarYearRangeLocal(
      nowLocal,
      pendingListRequest.yearOffset ?? 0,
    );
  }

  if (pendingListRequest.mode === 'day') {
    return getSingleDayRangeLocal(
      nowLocal,
      pendingListRequest.dayOffset ?? 0,
    );
  }

  if (pendingListRequest.mode === 'next_days') {
    return getNextDaysRangeLocal(
      nowLocal,
      pendingListRequest.spanDays ?? 2,
    );
  }

  if (pendingListRequest.mode === 'past') {
    return getPastRangeLocal(nowLocal);
  }

  return getUpcomingRangeLocal(nowLocal);
}