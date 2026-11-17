import type { DateTime } from 'luxon';

export const DEFAULT_EVENT_DURATION_MILLISECONDS = 60 * 60 * 1000;

/** Optional override for session default meeting length (ms). */
export function defaultEventDurationMs(
  meetingMinutes?: number,
): number {
  if (
    typeof meetingMinutes === 'number' &&
    Number.isFinite(meetingMinutes) &&
    meetingMinutes >= 15 &&
    meetingMinutes <= 180
  ) {
    return Math.round(meetingMinutes) * 60 * 1000;
  }
  return DEFAULT_EVENT_DURATION_MILLISECONDS;
}

/** Returns a positive duration or the default one-hour duration. */
export function getPositiveDurationOrDefault(
  startDateTime: DateTime,
  endDateTime: DateTime,
): number {
  const calculatedDurationMilliseconds =
    endDateTime.toMillis() - startDateTime.toMillis();

  if (calculatedDurationMilliseconds > 0) {
    return calculatedDurationMilliseconds;
  }

  return DEFAULT_EVENT_DURATION_MILLISECONDS;
}
