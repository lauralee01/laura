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
  /** Google Calendar id the event lives in (required for update/delete). */
  calendarId: string;
  eventId: string;
  title: string;
  isAllDay: boolean;
  startText: string;
  endText?: string;
  url?: string;
};

export type UpdateCalendarEventInput = {
  sessionId?: string;
  calendarId: string;
  eventId: string;
  timeZone: string;
  title?: string;
  /** Local ISO datetimes (same format as create). Omit both to leave times unchanged. */
  start?: string;
  end?: string;
  description?: string;
  reminderMinutesBefore?: number | null;
};

export type UpdateCalendarEventOutput = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  url: string;
};
