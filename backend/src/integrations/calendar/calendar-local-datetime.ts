import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/** True if the string looks like it includes Z or a numeric offset (we reject those for “local” inputs). */
export function hasTimezoneOffsetOrZ(s: string): boolean {
  return /[zZ]$/.test(s.trim()) || /[+\-]\d\d:\d\d$/.test(s.trim());
}

export type ParsedLocalRange = {
  startLocal: DateTime;
  endLocal: DateTime;
  startUtcIso: string;
  endUtcIso: string;
};

/**
 * Validates `start` / `end` as **local** wall times in `timeZone` (no `Z` / offset),
 * checks ordering, and returns Luxon values plus UTC ISO strings for the Calendar API.
 */
export function parseLocalDateTimeRange(params: {
  timeZone: string;
  start: string;
  end: string;
}): ParsedLocalRange {
  const { timeZone, start, end } = params;
  if (!timeZone || timeZone.trim().length === 0) {
    throw new BadRequestException('timeZone must not be empty');
  }

  if (hasTimezoneOffsetOrZ(start) || hasTimezoneOffsetOrZ(end)) {
    throw new BadRequestException(
      'start and end must be local ISO datetimes in the format YYYY-MM-DDTHH:mm:ss with NO trailing Z or timezone offset',
    );
  }

  const startLocal = DateTime.fromISO(start, { zone: timeZone });
  const endLocal = DateTime.fromISO(end, { zone: timeZone });

  if (!startLocal.isValid || !endLocal.isValid) {
    throw new BadRequestException(
      'start and end must be valid local ISO datetime strings (no timezone offset), e.g. 2026-03-26T12:00:00',
    );
  }

  if (endLocal.toMillis() <= startLocal.toMillis()) {
    throw new BadRequestException('end must be after start');
  }

  const startUtcIso = startLocal.toUTC().toISO();
  const endUtcIso = endLocal.toUTC().toISO();
  if (!startUtcIso || !endUtcIso) {
    throw new BadRequestException('Could not convert local times to UTC');
  }

  return { startLocal, endLocal, startUtcIso, endUtcIso };
}
