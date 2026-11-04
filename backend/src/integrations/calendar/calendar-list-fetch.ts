import type { calendar_v3 } from 'googleapis';
import { debugCalendarLog } from './calendar-debug';
import {
  mapGoogleCalendarEventToSortable,
  type SortableCalendarEvent,
} from './calendar-google-event.mapper';
import type { ListCalendarEventSummary } from './calendar.types';

const DEFAULT_PAGE_MAX = 250;
/** Cap concurrent Google Calendar events.list calls to avoid quota spikes. */
const CALENDAR_LIST_CONCURRENCY = 4;

/**
 * Loads every calendar id the user can see (calendarList), then lists events in
 * [timeMin, timeMax) for each (bounded parallelism), merges, sorts by start time,
 * optionally truncates to `maxEvents`.
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
    calendarIds,
    concurrency: CALENDAR_LIST_CONCURRENCY,
  });

  const perCalendarEvents = await mapWithConcurrency(
    calendarIds,
    CALENDAR_LIST_CONCURRENCY,
    (calendarId) =>
      fetchEventsForCalendar(calendar, {
        calendarId,
        timeZone: options.timeZone,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        pageMaxResults,
      }),
  );

  const all = perCalendarEvents.flat();
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

async function fetchEventsForCalendar(
  calendar: calendar_v3.Calendar,
  options: {
    calendarId: string;
    timeZone: string;
    timeMin: string;
    timeMax: string;
    pageMaxResults: number;
  },
): Promise<SortableCalendarEvent[]> {
  const events: SortableCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await calendar.events.list({
      calendarId: options.calendarId,
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: options.pageMaxResults,
      pageToken,
      timeZone: options.timeZone,
    });

    const items = data.items ?? [];

    debugCalendarLog('[calendar.listEvents] page', {
      calendarId: options.calendarId,
      nextPageTokenPresent: !!data.nextPageToken,
      returnedItemCount: items.length,
      pageTokenUsed: pageToken ?? null,
      accumulated: events.length,
    });

    for (const ev of items) {
      events.push(
        mapGoogleCalendarEventToSortable(
          ev,
          options.timeZone,
          options.calendarId,
        ),
      );
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: limit }, () => worker()),
  );

  return results;
}
