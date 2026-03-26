import type { calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import type { ListCalendarEventSummary } from './calendar.types';

/** Internal row used to merge events from many calendars then sort by time. */
export type SortableCalendarEvent = {
  sortMillis: number;
  summary: ListCalendarEventSummary;
};

/**
 * Maps one Google Calendar API event into a display summary + a numeric sort key.
 * Handles all-day (`date`) vs timed (`dateTime`) events differently.
 */
export function mapGoogleCalendarEventToSortable(
  ev: calendar_v3.Schema$Event,
  timeZone: string,
): SortableCalendarEvent {
  const id = ev.id ?? '';
  const title = ev.summary ?? '(Untitled)';

  const startDate = ev.start?.date;
  const startDateTime = ev.start?.dateTime;
  const endDate = ev.end?.date;
  const endDateTime = ev.end?.dateTime;

  const isAllDay = !!startDate && !startDateTime;

  if (isAllDay) {
    // For all-day events, Google uses end.date as *exclusive*.
    const startLocalDate = startDate
      ? DateTime.fromISO(startDate, { zone: timeZone })
      : null;
    const endExclusiveLocalDate = endDate
      ? DateTime.fromISO(endDate, { zone: timeZone })
      : null;

    const endInclusiveLocalDate =
      startLocalDate && endExclusiveLocalDate
        ? endExclusiveLocalDate.minus({ days: 1 })
        : null;

    const startText = startLocalDate
      ? startLocalDate.toFormat('ccc, LLL d, yyyy')
      : startDate ?? '';

    const endText =
      endInclusiveLocalDate &&
      endInclusiveLocalDate.toISODate() !== startLocalDate?.toISODate()
        ? endInclusiveLocalDate.toFormat('ccc, LLL d, yyyy')
        : undefined;

    const sortMillis = startLocalDate
      ? startLocalDate.toMillis()
      : Date.parse(startDate ?? '') || 0;

    return {
      sortMillis,
      summary: {
        eventId: id,
        title,
        isAllDay: true,
        startText,
        endText,
        url: ev.htmlLink ?? undefined,
      },
    };
  }

  const localStart = startDateTime
    ? DateTime.fromISO(startDateTime).setZone(timeZone)
    : null;
  const localEnd = endDateTime
    ? DateTime.fromISO(endDateTime).setZone(timeZone)
    : null;

  const startText = localStart
    ? localStart.toFormat('ccc, LLL d, yyyy - h:mm a')
    : startDateTime ?? '';

  const endText = localEnd ? localEnd.toFormat('h:mm a') : undefined;

  const sortMillis = localStart ? localStart.toMillis() : 0;

  return {
    sortMillis,
    summary: {
      eventId: id,
      title,
      isAllDay: false,
      startText,
      endText,
      url: ev.htmlLink ?? undefined,
    },
  };
}
