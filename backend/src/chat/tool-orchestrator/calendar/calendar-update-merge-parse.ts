import { DateTime } from 'luxon';

export const LOCAL_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/**
 * Parses a datetime returned by the LLM extractor as a local wall-clock time.
 *
 * The extractor may append "Z" even though it means a local time such as
 * "4 PM in America/Chicago". Removing the trailing "Z" prevents Luxon from
 * interpreting the value as UTC and shifting the clock time.
 */
export function parseExtractorLocalDateTime(
  extractedDateTime: string,
  timeZone: string,
): DateTime {
  const localDateTimeWithoutUtcSuffix = extractedDateTime.replace(/Z$/u, '');

  return DateTime.fromISO(localDateTimeWithoutUtcSuffix, {
    zone: timeZone,
  });
}

export function formatLocalDateTime(value: DateTime): string {
  return value.toFormat(LOCAL_DATE_TIME_FORMAT);
}
