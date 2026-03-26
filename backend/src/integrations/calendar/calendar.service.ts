import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from '../google/google-oauth.service';
import { fetchMergedEventsFromAllCalendars } from './calendar-list-fetch';
import { parseLocalDateTimeRange } from './calendar-local-datetime';
import { requireCalendarSessionId } from './calendar-session';
import type {
  CreateCalendarEventInput,
  CreateCalendarEventOutput,
  ListCalendarEventSummary,
  ListCalendarEventsInput,
} from './calendar.types';

export type {
  CreateCalendarEventInput,
  CreateCalendarEventOutput,
  ListCalendarEventSummary,
  ListCalendarEventsInput,
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
}
