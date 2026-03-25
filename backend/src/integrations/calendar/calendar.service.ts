import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from '../google/google-oauth.service';
import { DateTime } from 'luxon';

export type CreateCalendarEventInput = {
  sessionId?: string;
  timeZone: string; // IANA timezone (e.g. America/Chicago)
  title: string;
  start: string; // LOCAL ISO datetime without timezone offset (e.g. 2026-03-26T12:00:00)
  end: string; // LOCAL ISO datetime without timezone offset
  description?: string;
  reminderMinutesBefore?: number;
};

export type CreateCalendarEventOutput = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  reminderMinutesBefore?: number;
  url: string;
};

export type ListCalendarEventsInput = {
  sessionId?: string;
  timeZone: string; // IANA timezone (e.g. America/Chicago)
  start: string; // LOCAL ISO datetime without timezone offset; inclusive
  end: string; // LOCAL ISO datetime without timezone offset; exclusive
  maxEvents?: number; // Optional: stop after accumulating this many events
};

export type ListCalendarEventSummary = {
  eventId: string;
  title: string;
  isAllDay: boolean;
  startText: string;
  endText?: string;
  url?: string;
};

@Injectable()
export class CalendarService {
  constructor(private readonly googleOAuth: GoogleOAuthService) {}

  /**
   * Creates an event on the user’s **primary** Google calendar.
   */
  async createEvent(
    input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventOutput> {
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException('title must not be empty');
    }

    if (!input.timeZone || input.timeZone.trim().length === 0) {
      throw new BadRequestException('timeZone must not be empty');
    }

    // We intentionally treat `start/end` as LOCAL datetimes in `input.timeZone`.
    // If the model includes a timezone offset (e.g. `Z` or `+01:00`), converting
    // them as "local" would be incorrect (double conversion risk).
    const hasOffsetOrZ = (s: string): boolean =>
      /[zZ]$/.test(s.trim()) || /[+\-]\d\d:\d\d$/.test(s.trim());
    if (hasOffsetOrZ(input.start) || hasOffsetOrZ(input.end)) {
      throw new BadRequestException(
        'start and end must be local ISO datetimes in the format YYYY-MM-DDTHH:mm:ss with NO trailing Z or timezone offset',
      );
    }
    const startLocal = DateTime.fromISO(input.start, { zone: input.timeZone });
    const endLocal = DateTime.fromISO(input.end, { zone: input.timeZone });

    if (!startLocal.isValid || !endLocal.isValid) {
      throw new BadRequestException(
        'start and end must be valid local ISO datetime strings (no timezone offset), e.g. 2026-03-26T12:00:00',
      );
    }

    if (endLocal.toMillis() <= startLocal.toMillis()) {
      throw new BadRequestException('end must be after start');
    }

    const reminderMinutesBefore =
      input.reminderMinutesBefore !== undefined
        ? Number(input.reminderMinutesBefore)
        : undefined;

    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException(
        'sessionId is required to create a calendar event (use the same value as laura_session_id from the browser).',
      );
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const calendar = google.calendar({ version: 'v3', auth });

    const startUtcIso = startLocal.toUTC().toISO();
    const endUtcIso = endLocal.toUTC().toISO();
    if (!startUtcIso || !endUtcIso) {
      throw new BadRequestException('Could not convert local times to UTC');
    }

    const requestBody: {
      summary: string;
      description?: string;
      start: { dateTime: string; timeZone?: string };
      end: { dateTime: string; timeZone?: string };
      reminders?: {
        useDefault: boolean;
        overrides?: Array<{ method: string; minutes: number }>;
      };
    } = {
      summary: title,
      description: input.description?.trim() || undefined,
      start: { dateTime: startUtcIso },
      end: { dateTime: endUtcIso },
    };

    if (
      reminderMinutesBefore !== undefined &&
      !Number.isNaN(reminderMinutesBefore)
    ) {
      const minutes = Math.max(0, Math.floor(reminderMinutesBefore));
      requestBody.reminders = {
        useDefault: false,
        overrides: [{ method: 'popup', minutes }],
      };
    }

    try {
      const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody,
      });

      return {
        eventId: data.id ?? '',
        title,
        start: data.start?.dateTime ?? startUtcIso,
        end: data.end?.dateTime ?? endUtcIso,
        reminderMinutesBefore,
        url: data.htmlLink ?? '',
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Calendar API error';
      throw new BadRequestException(
        `Could not create calendar event: ${detail}`,
      );
    }
  }

  /**
   * Lists events from `start` (inclusive) to `end` (exclusive) for the user’s
   * **primary** Google calendar.
   *
   * Notes:
   * - `start/end` are treated as LOCAL datetimes in `input.timeZone`
   * - We include both timed + all-day events returned by Google Calendar
   */
  async listEvents(
    input: ListCalendarEventsInput,
  ): Promise<ListCalendarEventSummary[]> {
    if (!input.timeZone || input.timeZone.trim().length === 0) {
      throw new BadRequestException('timeZone must not be empty');
    }

    const hasOffsetOrZ = (s: string): boolean =>
      /[zZ]$/.test(s.trim()) || /[+\-]\d\d:\d\d$/.test(s.trim());
    if (hasOffsetOrZ(input.start) || hasOffsetOrZ(input.end)) {
      throw new BadRequestException(
        'start and end must be local ISO datetimes in the format YYYY-MM-DDTHH:mm:ss with NO trailing Z or timezone offset',
      );
    }

    const startLocal = DateTime.fromISO(input.start, { zone: input.timeZone });
    const endLocal = DateTime.fromISO(input.end, { zone: input.timeZone });

    if (!startLocal.isValid || !endLocal.isValid) {
      throw new BadRequestException(
        'start and end must be valid local ISO datetime strings (no timezone offset), e.g. 2026-03-26T12:00:00',
      );
    }

    if (endLocal.toMillis() <= startLocal.toMillis()) {
      throw new BadRequestException('end must be after start');
    }

    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException(
        'sessionId is required to list calendar events (use the same value as laura_session_id from the browser).',
      );
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarList = google.calendar({ version: 'v3', auth });

    const startUtcIso = startLocal.toUTC().toISO();
    const endUtcIso = endLocal.toUTC().toISO();
    if (!startUtcIso || !endUtcIso) {
      throw new BadRequestException('Could not convert local times to UTC');
    }

    const maxEvents = input.maxEvents ?? undefined;
    const pageMaxResults = 250;

    type SortableEvent = {
      sortMillis: number;
      summary: ListCalendarEventSummary;
    };
    const all: SortableEvent[] = [];

    console.log('[calendar.listEvents] request', {
      timeZone: input.timeZone,
      local: { start: input.start, end: input.end },
      utc: { timeMin: startUtcIso, timeMax: endUtcIso },
      maxEvents,
      pageMaxResults,
    });

    // Fetch the calendars we have access to, then list events from each.
    const calendarIds: string[] = [];
    let calPageToken: string | undefined;
    do {
      const { data } = await calendarList.calendarList.list({
        maxResults: 250,
        pageToken: calPageToken,
        showHidden: false,
      });

      for (const c of data.items ?? []) {
        if (c.id) calendarIds.push(c.id);
      }

      calPageToken = data.nextPageToken ?? undefined;
    } while (calPageToken);

    console.log('[calendar.listEvents] calendars', { count: calendarIds.length });

    for (const calendarId of calendarIds) {
      let pageToken: string | undefined;
      do {
        const { data } = await calendar.events.list({
          calendarId,
          timeMin: startUtcIso,
          timeMax: endUtcIso,
          singleEvents: true,
          orderBy: 'startTime',
          showDeleted: false,
          maxResults: pageMaxResults,
          pageToken,
          // Helps Google format some dateTime fields consistently.
          timeZone: input.timeZone,
        });

        const items = data.items ?? [];
        console.log('[calendar.listEvents] page', {
          calendarId,
          nextPageTokenPresent: !!data.nextPageToken,
          returnedItemCount: items.length,
          pageTokenUsed: pageToken ?? null,
          accumulated: all.length,
        });

        for (const ev of items) {
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
              ? DateTime.fromISO(startDate, { zone: input.timeZone })
              : null;
            const endExclusiveLocalDate = endDate
              ? DateTime.fromISO(endDate, { zone: input.timeZone })
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

            all.push({
              sortMillis,
              summary: {
                eventId: id,
                title,
                isAllDay: true,
                startText,
                endText,
                url: ev.htmlLink ?? undefined,
              },
            });
          } else {
            const localStart = startDateTime
              ? DateTime.fromISO(startDateTime).setZone(input.timeZone)
              : null;
            const localEnd = endDateTime
              ? DateTime.fromISO(endDateTime).setZone(input.timeZone)
              : null;

            const startText = localStart
              ? localStart.toFormat('ccc, LLL d, yyyy - h:mm a')
              : startDateTime ?? '';

            const endText = localEnd ? localEnd.toFormat('h:mm a') : undefined;

            const sortMillis = localStart ? localStart.toMillis() : 0;

            all.push({
              sortMillis,
              summary: {
                eventId: id,
                title,
                isAllDay: false,
                startText,
                endText,
                url: ev.htmlLink ?? undefined,
              },
            });
          }
        }

        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);

      // Optional fast path: if the user asked for "next N", we can stop when
      // we already have enough earliest events *after sorting*. Since we don’t
      // know other calendars yet, we still fetch all calendars for correctness.
    }

    all.sort((a, b) => a.sortMillis - b.sortMillis);

    const out =
      maxEvents !== undefined ? all.slice(0, maxEvents) : all;

    console.log('[calendar.listEvents] done', {
      returnedCount: out.length,
      maxEvents,
      totalFetched: all.length,
    });

    return out.map((x) => x.summary);
  }
}
