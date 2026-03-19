import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
  async createEvent(
    input: CreateCalendarEventInput
  ): Promise<CreateCalendarEventOutput> {
    const title = input.title.trim();
    if (!title) {
      throw new Error('title must not be empty');
    }

    const startDate = new Date(input.start);
    const endDate = new Date(input.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('start and end must be valid ISO date strings');
    }

    if (endDate.getTime() <= startDate.getTime()) {
      throw new Error('end must be after start');
    }

    const reminderMinutesBefore =
      input.reminderMinutesBefore !== undefined
        ? Number(input.reminderMinutesBefore)
        : undefined;

    const eventId = randomUUID();
    const url = `https://calendar.local/events/${eventId}`;
    console.log('url', url);

    // Stub-first: deterministic placeholder event creation.
    return {
      eventId,
      title,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      reminderMinutesBefore,
      url,
    };
  }
}

