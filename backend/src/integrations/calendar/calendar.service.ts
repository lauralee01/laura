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
    console.log('input.start', input.start);
    console.log('input.end', input.end);
    console.log('input.timeZone', input.timeZone);

    const startLocal = DateTime.fromISO(input.start, { zone: input.timeZone });
    const endLocal = DateTime.fromISO(input.end, { zone: input.timeZone });
    console.log('startLocal', startLocal);
    console.log('endLocal', endLocal);

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
}
