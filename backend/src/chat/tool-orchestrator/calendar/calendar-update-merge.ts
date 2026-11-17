import { DateTime } from 'luxon';
import { userMessageSpecifiesCalendarDate } from './calendar-update-merge-date-detect';
import {
  DEFAULT_EVENT_DURATION_MILLISECONDS,
  getPositiveDurationOrDefault,
} from './calendar-update-merge-duration';
import {
  formatLocalDateTime,
  parseExtractorLocalDateTime,
} from './calendar-update-merge-parse';

export { defaultEventDurationMs } from './calendar-update-merge-duration';

type MergeParams = {
  userMessage: string;
  timeZone: string;
  eventStartLocalIso: string;
  eventEndLocalIso?: string | null;
  newStart: string | null;
  newEnd: string | null;
};

function resolveCorrectedEnd(params: {
  timeZone: string;
  correctedStart: DateTime;
  existingStart: DateTime;
  eventEndLocalIso?: string | null;
  extractedNewStart: DateTime;
  extractedNewEndIso: string | null;
}): DateTime {
  const {
    timeZone,
    correctedStart,
    existingStart,
    eventEndLocalIso,
    extractedNewStart,
    extractedNewEndIso,
  } = params;

  if (extractedNewEndIso) {
    const extractedNewEnd = parseExtractorLocalDateTime(
      extractedNewEndIso,
      timeZone,
    );

    if (extractedNewEnd.isValid) {
      return correctedStart.plus({
        milliseconds: getPositiveDurationOrDefault(
          extractedNewStart,
          extractedNewEnd,
        ),
      });
    }

    return correctedStart.plus({
      milliseconds: DEFAULT_EVENT_DURATION_MILLISECONDS,
    });
  }

  if (eventEndLocalIso) {
    const existingEnd = DateTime.fromISO(eventEndLocalIso, {
      zone: timeZone,
    });

    if (existingEnd.isValid) {
      return correctedStart.plus({
        milliseconds: getPositiveDurationOrDefault(
          existingStart,
          existingEnd,
        ),
      });
    }
  }

  return correctedStart.plus({
    milliseconds: DEFAULT_EVENT_DURATION_MILLISECONDS,
  });
}

/**
 * Corrects a likely time-only calendar update.
 *
 * Example: event is Friday 2 PM; user says "Move it to 4 PM"; extractor
 * returns today 4 PM → result is Friday 4 PM (same day, new clock time).
 */
export function mergeTimeOnlyUpdateOntoEventDay(
  params: MergeParams,
): { start: string; end: string } | null {
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

  const existingStart = DateTime.fromISO(eventStartLocalIso, {
    zone: timeZone,
  });

  if (!existingStart.isValid) {
    return null;
  }

  const extractedNewStart = parseExtractorLocalDateTime(
    extractedNewStartIso,
    timeZone,
  );

  if (!extractedNewStart.isValid) {
    return null;
  }

  if (
    extractedNewStart.startOf('day').equals(existingStart.startOf('day'))
  ) {
    return null;
  }

  /*
   * If the user did not name a calendar date, any date from the extractor is
   * an inferred fallback. Keep the event's day; apply the extracted clock.
   */
  const correctedStart = existingStart.set({
    hour: extractedNewStart.hour,
    minute: extractedNewStart.minute,
    second: extractedNewStart.second,
    millisecond: extractedNewStart.millisecond,
  });

  const correctedEnd = resolveCorrectedEnd({
    timeZone,
    correctedStart,
    existingStart,
    eventEndLocalIso,
    extractedNewStart,
    extractedNewEndIso,
  });

  return {
    start: formatLocalDateTime(correctedStart),
    end: formatLocalDateTime(correctedEnd),
  };
}
