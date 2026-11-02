import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/** True if the string looks like it includes Z or a numeric offset (we reject those for “local” inputs). */
export function hasTimezoneOffsetOrZ(s: string): boolean {
  return /[zZ]$/.test(s.trim()) || /[+\-]\d\d:\d\d$/.test(s.trim());
}

/** Converts a Google API dateTime (usually UTC ISO) to local wall-clock ISO. */
export function googleDateTimeToLocalIso(
  dateTime: string | null | undefined,
  timeZone: string,
): string | null {
  if (!dateTime?.trim()) {
    return null;
  }

  const local = DateTime.fromISO(dateTime.trim(), { setZone: true }).setZone(
    timeZone,
  );

  if (!local.isValid) {
    return null;
  }

  return local.toFormat("yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Fills missing start or end so Calendar patches always send a complete timed
 * range. When only one side is provided, preserves the existing duration.
 */
export function resolveUpdateLocalRange(params: {
  timeZone: string;
  inputStart?: string;
  inputEnd?: string;
  existingStartDateTime?: string | null;
  existingEndDateTime?: string | null;
}): { start: string; end: string } {
  const timeZone = params.timeZone;
  const inputStart = params.inputStart?.trim() || undefined;
  const inputEnd = params.inputEnd?.trim() || undefined;
  const existingStartLocal = googleDateTimeToLocalIso(
    params.existingStartDateTime,
    timeZone,
  );
  const existingEndLocal = googleDateTimeToLocalIso(
    params.existingEndDateTime,
    timeZone,
  );

  if (inputStart && inputEnd) {
    return { start: inputStart, end: inputEnd };
  }

  const existingStartDt = existingStartLocal
    ? DateTime.fromISO(existingStartLocal, { zone: timeZone })
    : null;
  const existingEndDt = existingEndLocal
    ? DateTime.fromISO(existingEndLocal, { zone: timeZone })
    : null;
  const existingDurationMs =
    existingStartDt?.isValid && existingEndDt?.isValid
      ? existingEndDt.toMillis() - existingStartDt.toMillis()
      : null;

  if (inputStart && !inputEnd) {
    const startDt = DateTime.fromISO(inputStart, { zone: timeZone });
    if (!startDt.isValid) {
      throw new BadRequestException('start is not a valid local datetime');
    }

    if (existingDurationMs != null && existingDurationMs > 0) {
      const endIso = startDt
        .plus({ milliseconds: existingDurationMs })
        .toFormat("yyyy-MM-dd'T'HH:mm:ss");
      return { start: inputStart, end: endIso };
    }

    if (existingEndLocal) {
      return { start: inputStart, end: existingEndLocal };
    }

    throw new BadRequestException(
      'Could not resolve end time for this update from the existing event.',
    );
  }

  if (inputEnd && !inputStart) {
    const endDt = DateTime.fromISO(inputEnd, { zone: timeZone });
    if (!endDt.isValid) {
      throw new BadRequestException('end is not a valid local datetime');
    }

    if (existingDurationMs != null && existingDurationMs > 0) {
      const startIso = endDt
        .minus({ milliseconds: existingDurationMs })
        .toFormat("yyyy-MM-dd'T'HH:mm:ss");
      return { start: startIso, end: inputEnd };
    }

    if (existingStartLocal) {
      return { start: existingStartLocal, end: inputEnd };
    }

    throw new BadRequestException(
      'Could not resolve start time for this update from the existing event.',
    );
  }

  throw new BadRequestException(
    'Could not resolve both start and end times for this update. Provide both, or ensure the existing event has timed start/end values.',
  );
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
