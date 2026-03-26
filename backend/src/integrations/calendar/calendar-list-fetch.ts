import type { calendar_v3 } from 'googleapis';
import { debugCalendarLog } from './calendar-debug';
import {
  mapGoogleCalendarEventToSortable,
  type SortableCalendarEvent,
} from './calendar-google-event.mapper';
import type { ListCalendarEventSummary } from './calendar.types';

const DEFAULT_PAGE_MAX = 250;

/**
 * Loads every calendar id the user can see (calendarList), then lists events in
 * [timeMin, timeMax) for each, merges, sorts by start time, optionally truncates to `maxEvents`.
 */
export async function fetchMergedEventsFromAllCalendars(
  calendar: calendar_v3.Calendar,
  options: {
    timeZone: string;
    timeMin: string;
    timeMax: string;
    maxEvents?: number;
    pageMaxResults?: number;
    /** Mirrored into DEBUG logs (local wall times before UTC conversion). */
    localRangeForDebug?: { start: string; end: string };
  },
): Promise<ListCalendarEventSummary[]> {
  const pageMaxResults = options.pageMaxResults ?? DEFAULT_PAGE_MAX;
  const maxEvents = options.maxEvents ?? undefined;

  debugCalendarLog('[calendar.listEvents] request', {
    timeZone: options.timeZone,
    ...(options.localRangeForDebug && {
      local: options.localRangeForDebug,
    }),
    utc: { timeMin: options.timeMin, timeMax: options.timeMax },
    maxEvents,
    pageMaxResults,
  });

  const calendarIds = await fetchAllCalendarIds(calendar);
  debugCalendarLog('[calendar.listEvents] calendars', {
    count: calendarIds.length,
  });

  const all: SortableCalendarEvent[] = [];

  for (const calendarId of calendarIds) {
    let pageToken: string | undefined;
    do {
      const { data } = await calendar.events.list({
        calendarId,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        showDeleted: false,
        maxResults: pageMaxResults,
        pageToken,
        timeZone: options.timeZone,
      });

      const items = data.items ?? [];
      debugCalendarLog('[calendar.listEvents] page', {
        calendarId,
        nextPageTokenPresent: !!data.nextPageToken,
        returnedItemCount: items.length,
        pageTokenUsed: pageToken ?? null,
        accumulated: all.length,
      });

      for (const ev of items) {
        all.push(
          mapGoogleCalendarEventToSortable(ev, options.timeZone),
        );
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  all.sort((a, b) => a.sortMillis - b.sortMillis);

  const out =
    maxEvents !== undefined ? all.slice(0, maxEvents) : all;

  debugCalendarLog('[calendar.listEvents] done', {
    returnedCount: out.length,
    maxEvents,
    totalFetched: all.length,
  });

  return out.map((x) => x.summary);
}

async function fetchAllCalendarIds(
  calendar: calendar_v3.Calendar,
): Promise<string[]> {
  const calendarIds: string[] = [];
  let calPageToken: string | undefined;
  do {
    const { data } = await calendar.calendarList.list({
      maxResults: 250,
      pageToken: calPageToken,
      showHidden: false,
    });

    for (const c of data.items ?? []) {
      if (c.id) calendarIds.push(c.id);
    }

    calPageToken = data.nextPageToken ?? undefined;
  } while (calPageToken);

  return calendarIds;
}
