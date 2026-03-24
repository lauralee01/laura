import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from '../google/google-oauth.service';

export type CreateCalendarEventInput = {
  sessionId?: string;
  title: string;
  start: string; // ISO string
  end: string; // ISO string
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

    const startDate = new Date(input.start);
    const endDate = new Date(input.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'start and end must be valid ISO date strings',
      );
    }

    if (endDate.getTime() <= startDate.getTime()) {
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
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
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
        start: data.start?.dateTime ?? startDate.toISOString(),
        end: data.end?.dateTime ?? endDate.toISOString(),
        reminderMinutesBefore,
        url: data.htmlLink ?? '',
      };
      console.log('return', {data, requestBody})
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Calendar API error';
      throw new BadRequestException(
        `Could not create calendar event: ${detail}`,
      );
    }
  }
}
