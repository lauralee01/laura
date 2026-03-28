import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { GoogleOAuthService } from '../google/google-oauth.service';
import { fetchMergedEventsFromAllCalendars } from './calendar-list-fetch';
import { parseLocalDateTimeRange } from './calendar-local-datetime';
import { requireCalendarSessionId } from './calendar-session';
import type {
  CreateCalendarEventInput,
  CreateCalendarEventOutput,
  ListCalendarEventSummary,
  ListCalendarEventsInput,
  UpdateCalendarEventInput,
  UpdateCalendarEventOutput,
} from './calendar.types';

export type {
  CreateCalendarEventInput,
  CreateCalendarEventOutput,
  ListCalendarEventSummary,
  ListCalendarEventsInput,
  UpdateCalendarEventInput,
  UpdateCalendarEventOutput,
} from './calendar.types';

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

    const { startUtcIso, endUtcIso } = parseLocalDateTimeRange({
      timeZone: input.timeZone,
      start: input.start,
      end: input.end,
    });

    const reminderMinutesBefore =
      input.reminderMinutesBefore !== undefined
        ? Number(input.reminderMinutesBefore)
        : undefined;

    const sessionId = requireCalendarSessionId(
      input.sessionId,
      'sessionId is required to create a calendar event (use the same value as laura_session_id from the browser).',
    );

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const calendar = google.calendar({ version: 'v3', auth });

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
   * Lists events from `start` (inclusive) to `end` (exclusive) across **all**
   * calendars the account can access, merged and sorted by start time.
   *
   * Notes:
   * - `start/end` are treated as LOCAL datetimes in `input.timeZone`
   * - Includes both timed + all-day events returned by Google Calendar
   */
  async listEvents(
    input: ListCalendarEventsInput,
  ): Promise<ListCalendarEventSummary[]> {
    const { startUtcIso, endUtcIso } = parseLocalDateTimeRange({
      timeZone: input.timeZone,
      start: input.start,
      end: input.end,
    });

    const sessionId = requireCalendarSessionId(
      input.sessionId,
      'sessionId is required to list calendar events (use the same value as laura_session_id from the browser).',
    );

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const calendar = google.calendar({ version: 'v3', auth });

    return fetchMergedEventsFromAllCalendars(calendar, {
      timeZone: input.timeZone.trim(),
      timeMin: startUtcIso,
      timeMax: endUtcIso,
      maxEvents: input.maxEvents,
      localRangeForDebug: { start: input.start, end: input.end },
    });
  }

  /**
   * Patches an event (timed events only for start/end changes; all-day can change title).
   */
  async updateEvent(
    input: UpdateCalendarEventInput,
  ): Promise<UpdateCalendarEventOutput> {
    const sessionId = requireCalendarSessionId(
      input.sessionId,
      'sessionId is required to update a calendar event.',
    );
    const calendarId = input.calendarId?.trim();
    const eventId = input.eventId?.trim();
    if (!calendarId || !eventId) {
      throw new BadRequestException('calendarId and eventId are required.');
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const calendar = google.calendar({ version: 'v3', auth });

    let existing: calendar_v3.Schema$Event;
    try {
      const { data } = await calendar.events.get({ calendarId, eventId });
      if (!data) {
        throw new BadRequestException('Event not found.');
      }
      existing = data;
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Calendar API error';
      throw new BadRequestException(`Could not load event: ${detail}`);
    }

    const isAllDay = !!(existing.start?.date && !existing.start?.dateTime);
    if (isAllDay && (input.start || input.end)) {
      throw new BadRequestException(
        'Rescheduling all-day events is not supported yet. Ask for a title-only change or edit the event in Google Calendar.',
      );
    }

    const requestBody: {
      summary?: string;
      description?: string;
      start?: { dateTime: string };
      end?: { dateTime: string };
      reminders?: {
        useDefault: boolean;
        overrides?: Array<{ method: string; minutes: number }>;
      };
    } = {};

    if (input.title?.trim()) {
      requestBody.summary = input.title.trim();
    }
    if (input.description !== undefined) {
      requestBody.description = input.description.trim() || undefined;
    }

    if (input.start && input.end) {
      const { startUtcIso, endUtcIso } = parseLocalDateTimeRange({
        timeZone: input.timeZone,
        start: input.start,
        end: input.end,
      });
      requestBody.start = { dateTime: startUtcIso };
      requestBody.end = { dateTime: endUtcIso };
    }

    if (input.reminderMinutesBefore !== undefined) {
      if (input.reminderMinutesBefore === null) {
        requestBody.reminders = { useDefault: true };
      } else {
        const minutes = Math.max(
          0,
          Math.floor(Number(input.reminderMinutesBefore)),
        );
        if (!Number.isNaN(minutes)) {
          requestBody.reminders = {
            useDefault: false,
            overrides: [{ method: 'popup', minutes }],
          };
        }
      }
    }

    if (Object.keys(requestBody).length === 0) {
      throw new BadRequestException(
        'Nothing to update — provide a new title, time, description, or reminder.',
      );
    }

    try {
      const { data } = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody,
      });

      const title = data.summary ?? input.title ?? '(Untitled)';
      const start = data.start?.dateTime ?? data.start?.date ?? '';
      const end = data.end?.dateTime ?? data.end?.date ?? '';

      return {
        eventId: data.id ?? eventId,
        title,
        start,
        end,
        url: data.htmlLink ?? '',
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Calendar API error';
      throw new BadRequestException(
        `Could not update calendar event: ${detail}`,
      );
    }
  }

  async deleteEvent(
    sessionId: string | undefined,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    const sid = requireCalendarSessionId(
      sessionId,
      'sessionId is required to delete a calendar event.',
    );
    const calId = calendarId?.trim();
    const evId = eventId?.trim();
    if (!calId || !evId) {
      throw new BadRequestException('calendarId and eventId are required.');
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sid);
    const calendar = google.calendar({ version: 'v3', auth });

    try {
      await calendar.events.delete({ calendarId: calId, eventId: evId });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Calendar API error';
      throw new BadRequestException(
        `Could not delete calendar event: ${detail}`,
      );
    }
  }
}
