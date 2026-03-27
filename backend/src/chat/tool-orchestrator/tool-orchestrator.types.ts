/** Stored when calendar create is blocked on timezone. */
export type PendingCalendarCreatePayload = {
  message: string;
};

/** After a Gmail draft is created: wait for explicit send confirmation. */
export type PendingEmailSendPayload = {
  draftId: string;
  recipients: string[];
  subject: string;
};

export type CalendarListMode =
  | 'week'
  | 'month'
  | 'year'
  | 'day'
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
  maxEvents?: number; // upcoming / past: how many events to show
};
