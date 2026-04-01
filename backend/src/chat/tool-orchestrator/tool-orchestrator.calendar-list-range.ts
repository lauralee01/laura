import { DateTime } from 'luxon';
import {
  getCalendarMonthRangeLocal,
  getCalendarYearRangeLocal,
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
  getPastRangeLocal,
  getSingleDayRangeLocal,
  getUpcomingRangeLocal,
} from './tool-orchestrator.calendar-ranges';
import type { PendingCalendarListPayload } from './tool-orchestrator.types';

/**
 * Maps a stored list payload + “now” in the user’s zone to API [start, end) window strings.
 * Used by live list and by “user just gave timezone” resume paths.
 */
export function resolvePendingListRange(
  nowLocal: DateTime,
  timeZone: string,
  weekOffset: number,
  pendingListRequest: PendingCalendarListPayload,
): { startLocal: string; endLocal: string } {
  if (pendingListRequest.mode === 'week') {
    return getMonToSunRangeLocal(nowLocal, timeZone, weekOffset);
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
