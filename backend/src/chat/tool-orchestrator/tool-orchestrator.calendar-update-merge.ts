import { DateTime } from 'luxon';

/**
 * True when the user likely named a calendar date (so we should trust the LLM’s dates).
 */
function userMessageSpecifiesCalendarDate(message: string): boolean {
  const m = message.toLowerCase();
  if (/\b(today|tomorrow|yesterday)\b/.test(m)) return true;
  if (
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(m)
  )
    return true;
  if (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      m,
    )
  )
    return true;
  if (/\b(next|last)\s+(week|month|year)\b/.test(m)) return true;
  if (/\d{1,2}\/\d{1,2}/.test(m)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(m)) return true;
  return false;
}

/**
 * When the extractor returns a new start on *today* but the matched event is on another day,
 * the user often meant “change the clock time only” (e.g. “move to 4pm”). Re-apply that time
 * on the event’s actual calendar day and preserve duration when possible.
 */
export function mergeTimeOnlyUpdateOntoEventDay(params: {
  userMessage: string;
  timeZone: string;
  eventStartLocalIso: string;
  eventEndLocalIso?: string | null;
  newStart: string | null;
  newEnd: string | null;
}): { start: string; end: string } | null {
  const { userMessage, timeZone, eventStartLocalIso, eventEndLocalIso } =
    params;
  const newStartRaw = params.newStart;
  const newEndRaw = params.newEnd;

  if (!newStartRaw && !newEndRaw) return null;
  if (userMessageSpecifiesCalendarDate(userMessage)) return null;

  const eventStart = DateTime.fromISO(eventStartLocalIso, { zone: timeZone });
  if (!eventStart.isValid) return null;

  const newStart = newStartRaw
    ? DateTime.fromISO(newStartRaw.replace(/Z$/u, ''), { zone: timeZone })
    : null;
  if (!newStart || !newStart.isValid) return null;

  const today = DateTime.now().setZone(timeZone).startOf('day');
  const newDay = newStart.startOf('day');
  const eventDay = eventStart.startOf('day');

  if (newDay.equals(eventDay)) return null;

  if (!newDay.equals(today)) return null;

  const mergedStart = eventStart.set({
    hour: newStart.hour,
    minute: newStart.minute,
    second: newStart.second,
    millisecond: newStart.millisecond,
  });

  let mergedEnd: DateTime;
  if (newEndRaw) {
    const newEnd = DateTime.fromISO(newEndRaw.replace(/Z$/u, ''), {
      zone: timeZone,
    });
    if (newEnd.isValid) {
      const deltaMs = newEnd.toMillis() - newStart.toMillis();
      mergedEnd = mergedStart.plus({ milliseconds: deltaMs });
    } else {
      mergedEnd = mergedStart.plus({ hours: 1 });
    }
  } else if (eventEndLocalIso) {
    const eventEnd = DateTime.fromISO(eventEndLocalIso, { zone: timeZone });
    if (eventEnd.isValid) {
      const durMs = eventEnd.toMillis() - eventStart.toMillis();
      mergedEnd = mergedStart.plus({ milliseconds: durMs });
    } else {
      mergedEnd = mergedStart.plus({ hours: 1 });
    }
  } else {
    mergedEnd = mergedStart.plus({ hours: 1 });
  }

  return {
    start: mergedStart.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    end: mergedEnd.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
  };
}
