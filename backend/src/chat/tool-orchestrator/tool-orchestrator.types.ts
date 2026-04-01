/** Stored when calendar create is blocked on timezone. */
export type PendingCalendarCreatePayload = {
  message: string;
};

/** After a Gmail draft is created: wait for explicit send confirmation. */
export type PendingEmailSendPayload = {
  draftId: string;
  recipients: string[];
  subject: string;
  /** Latest plain-text body (for in-chat revisions before send). */
  body: string;
};

export type CalendarListMode =
  | 'week'
  | 'month'
  | 'year'
  | 'day'
  | 'next_days'
  | 'upcoming'
  | 'past';

/** Stored when calendar list is blocked on timezone. */
export type PendingCalendarListPayload = {
  mode: CalendarListMode;
  weekOffset: number; // 0 = this week, 1 = next week, -1 = last week
  dayOffset?: number; // 0 = today, 1 = tomorrow, -1 = yesterday
  /** 0 = this calendar month, 1 = next, -1 = previous */
  monthOffset?: number;
  /** 0 = this calendar year, 1 = next, -1 = previous */
  yearOffset?: number;
  /** next_days: number of calendar days from today’s start (default 2 for “today and tomorrow”). */
  spanDays?: number;
  maxEvents?: number; // upcoming / past: how many events to show
};

export type PendingCalendarMutationOption = {
  index: number;
  eventId: string;
  calendarId: string;
  title: string;
  startText: string;
  /** Timed events only; used to fix time-only reschedules onto the correct day. */
  startLocalIso?: string;
  endLocalIso?: string;
};

/** Waiting for timezone before delete/update resolution. */
export type PendingCalendarMutateTzPayload = {
  message: string;
};

/** User must pick which event when several match. */
export type PendingCalendarDeletePayload =
  | {
      phase: 'pick';
      timeZone: string;
      options: PendingCalendarMutationOption[];
    }
  | {
      phase: 'confirm';
      timeZone: string;
      eventId: string;
      calendarId: string;
      title: string;
      startText: string;
    };

/** Update applies after pick (no second confirm). */
export type PendingCalendarUpdatePayload = {
  phase: 'pick';
  timeZone: string;
  newTitle: string | null;
  newStart: string | null;
  newEnd: string | null;
  options: PendingCalendarMutationOption[];
};
