import { DateTime } from 'luxon';

const LOCAL_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";
const DEFAULT_EVENT_DURATION_MILLISECONDS = 60 * 60 * 1000;

const DEBUG_LOG_PREFIX = '[calendar-time-only-merge]';

/**
 * Returns true when the user's message appears to contain a calendar date.
 *
 * When the user explicitly names a date, we should trust the date returned
 * by the calendar update extractor instead of forcing the update onto the
 * matched event's existing day.
 */
function userMessageSpecifiesCalendarDate(userMessage: string): boolean {
  const normalizedUserMessage = userMessage.toLowerCase();

  const containsRelativeDay =
    /\b(today|tomorrow|yesterday)\b/.test(normalizedUserMessage);

  const containsWeekday =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalizedUserMessage,
    );

  const containsMonthName =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      normalizedUserMessage,
    );

  const containsRelativeCalendarPeriod =
    /\b(this|next|last)\s+(week|weekend|month|year)\b/.test(
      normalizedUserMessage,
    );

  const containsNumericRelativeDate =
    /\b(?:in\s+)?\d+\s+(?:day|days|week|weeks|month|months|year|years)(?:\s+from\s+now)?\b/.test(
      normalizedUserMessage,
    );

  const containsOrdinalDate =
    /\b\d{1,2}(?:st|nd|rd|th)\b/.test(normalizedUserMessage);

  const containsSlashFormattedDate =
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalizedUserMessage);

  const containsIsoFormattedDate =
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalizedUserMessage);

  const specifiesCalendarDate =
    containsRelativeDay ||
    containsWeekday ||
    containsMonthName ||
    containsRelativeCalendarPeriod ||
    containsNumericRelativeDate ||
    containsOrdinalDate ||
    containsSlashFormattedDate ||
    containsIsoFormattedDate;

  return specifiesCalendarDate;
}

/**
 * Parses a datetime returned by the LLM extractor as a local wall-clock time.
 *
 * The extractor may append "Z" even though it means a local time such as
 * "4 PM in America/Chicago". Removing the trailing "Z" prevents Luxon from
 * interpreting the value as UTC and shifting the clock time.
 */
function parseExtractorLocalDateTime(
  extractedDateTime: string,
  timeZone: string,
): DateTime {
  const localDateTimeWithoutUtcSuffix = extractedDateTime.replace(/Z$/u, '');

  return DateTime.fromISO(localDateTimeWithoutUtcSuffix, {
    zone: timeZone,
  });
}

/**
 * Returns a positive duration or the default one-hour duration.
 */
function getPositiveDurationOrDefault(params: {
  startDateTime: DateTime;
  endDateTime: DateTime;
  durationSource: 'extracted update' | 'existing event';
}): number {
  const { startDateTime, endDateTime, durationSource } = params;

  const calculatedDurationMilliseconds =
    endDateTime.toMillis() - startDateTime.toMillis();

  if (calculatedDurationMilliseconds > 0) {
    return calculatedDurationMilliseconds;
  }

  return DEFAULT_EVENT_DURATION_MILLISECONDS;
}

/**
 * Corrects a likely time-only calendar update.
 *
 * Example:
 *
 * Existing event:
 * Friday at 2 PM
 *
 * User:
 * "Move it to 4 PM"
 *
 * Extractor result:
 * Today at 4 PM
 *
 * Corrected result:
 * Friday at 4 PM
 *
 * The matched event's original calendar day is preserved while the extracted
 * clock time is applied to it.
 */
export function mergeTimeOnlyUpdateOntoEventDay(params: {
  userMessage: string;
  timeZone: string;
  eventStartLocalIso: string;
  eventEndLocalIso?: string | null;
  newStart: string | null;
  newEnd: string | null;
}): { start: string; end: string } | null {
  const {
    userMessage,
    timeZone,
    eventStartLocalIso,
    eventEndLocalIso,
    newStart: extractedNewStartIso,
    newEnd: extractedNewEndIso,
  } = params;

  /*
   * This correction cannot safely operate using only a new end time because
   * it needs a new clock time to apply to the event's existing day.
   */
  if (!extractedNewStartIso) {
    return null;
  }

  if (userMessageSpecifiesCalendarDate(userMessage)) {
    return null;
  }

  const existingEventStartDateTime = DateTime.fromISO(
    eventStartLocalIso,
    {
      zone: timeZone,
    },
  );

  if (!existingEventStartDateTime.isValid) {
    console.warn(`${DEBUG_LOG_PREFIX} merge skipped`, {
      reason: 'The existing event start could not be parsed.',
      existingEventStart: eventStartLocalIso,
      invalidReason: existingEventStartDateTime.invalidReason,
      invalidExplanation: existingEventStartDateTime.invalidExplanation,
    });

    return null;
  }

  const extractedNewStartDateTime = parseExtractorLocalDateTime(
    extractedNewStartIso,
    timeZone,
  );

  if (!extractedNewStartDateTime.isValid) {
    return null;
  }

  const todayInRequestedTimeZone = DateTime.now()
    .setZone(timeZone)
    .startOf('day');

  const existingEventCalendarDay =
    existingEventStartDateTime.startOf('day');

  const extractedNewStartCalendarDay =
    extractedNewStartDateTime.startOf('day');

  if (extractedNewStartCalendarDay.equals(existingEventCalendarDay)) {
    return null;
  }

  /*
   * If the user message did NOT specify a calendar date, any date produced by the extractor
   * is an inferred fallback (e.g. today or tomorrow). Always apply the extracted clock time
   * onto the target event's existing calendar day.
   */

  const correctedEventStartDateTime = existingEventStartDateTime.set({
    hour: extractedNewStartDateTime.hour,
    minute: extractedNewStartDateTime.minute,
    second: extractedNewStartDateTime.second,
    millisecond: extractedNewStartDateTime.millisecond,
  });

  let correctedEventEndDateTime: DateTime;

  if (extractedNewEndIso) {
    const extractedNewEndDateTime = parseExtractorLocalDateTime(
      extractedNewEndIso,
      timeZone,
    );

    if (extractedNewEndDateTime.isValid) {
      const extractedUpdateDurationMilliseconds =
        getPositiveDurationOrDefault({
          startDateTime: extractedNewStartDateTime,
          endDateTime: extractedNewEndDateTime,
          durationSource: 'extracted update',
        });

      correctedEventEndDateTime = correctedEventStartDateTime.plus({
        milliseconds: extractedUpdateDurationMilliseconds,
      });
    } else {
      correctedEventEndDateTime = correctedEventStartDateTime.plus({
        milliseconds: DEFAULT_EVENT_DURATION_MILLISECONDS,
      });
    }
  } else if (eventEndLocalIso) {
    const existingEventEndDateTime = DateTime.fromISO(
      eventEndLocalIso,
      {
        zone: timeZone,
      },
    );

    if (existingEventEndDateTime.isValid) {
      const existingEventDurationMilliseconds =
        getPositiveDurationOrDefault({
          startDateTime: existingEventStartDateTime,
          endDateTime: existingEventEndDateTime,
          durationSource: 'existing event',
        });

      correctedEventEndDateTime = correctedEventStartDateTime.plus({
        milliseconds: existingEventDurationMilliseconds,
      });
    } else {
      correctedEventEndDateTime = correctedEventStartDateTime.plus({
        milliseconds: DEFAULT_EVENT_DURATION_MILLISECONDS,
      });
    }
  } else {
    correctedEventEndDateTime = correctedEventStartDateTime.plus({
      milliseconds: DEFAULT_EVENT_DURATION_MILLISECONDS,
    });
  }

  const correctedStartLocalIso = correctedEventStartDateTime.toFormat(
    LOCAL_DATE_TIME_FORMAT,
  );

  const correctedEndLocalIso = correctedEventEndDateTime.toFormat(
    LOCAL_DATE_TIME_FORMAT,
  );

  return {
    start: correctedStartLocalIso,
    end: correctedEndLocalIso,
  };
}