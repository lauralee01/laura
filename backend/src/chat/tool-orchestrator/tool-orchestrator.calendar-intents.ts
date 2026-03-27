import { DateTime } from 'luxon';

export function isEmailDraftIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (text.includes('write email') || text.includes('compose email')) {
    return true;
  }
  return text.includes('draft') && text.includes('email');
}

export function isCalendarCreateIntent(message: string): boolean {
  const text = message.toLowerCase();

  const hasMonthName =
    /january|february|march|april|may|june|july|august|september|october|november|december/.test(
      text,
    );
  const hasIsoDate = /\b\d{4}-\d{2}-\d{2}\b/.test(text);
  const hasRelativeDay =
    text.includes('today') ||
    text.includes('tomorrow') ||
    text.includes('tonight') ||
    text.includes('next week') ||
    text.includes('next monday') ||
    text.includes('next tuesday') ||
    text.includes('next wednesday') ||
    text.includes('next thursday') ||
    text.includes('next friday') ||
    text.includes('next saturday') ||
    text.includes('next sunday');

  const hasTime =
    /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(text) ||
    /\bat\s+\d{1,2}(:\d{2})?\b/.test(text) ||
    /\b\d{1,2}(:\d{2})\b/.test(text);

  const hasDateTimeHint = (hasMonthName || hasIsoDate || hasRelativeDay) && hasTime;

  const hasSchedulingVerb =
    text.includes('create') ||
    text.includes('add') ||
    text.includes('schedule') ||
    text.includes('book') ||
    text.includes('set up') ||
    text.includes('plan');

  const hasCalendarNoun =
    text.includes('calendar') ||
    /\b(event|meeting|appointment|visit)\b/.test(text) ||
    text.includes('reminder') ||
    text.includes('remind');

  return hasDateTimeHint && (hasSchedulingVerb || hasCalendarNoun);
}

export function isCalendarListIntent(message: string): boolean {
  const text = message.toLowerCase();

  const hasCalendarNoun =
    text.includes('calendar') ||
    text.includes('events') ||
    text.includes('event') ||
    text.includes('appointments') ||
    text.includes('meetings') ||
    text.includes('lined up');

  const hasListVerb =
    text.includes('list') ||
    text.includes('show') ||
    text.includes('go through') ||
    text.includes('lined up') ||
    text.includes('upcoming');

  const hasWeek =
    text.includes('week') || (text.includes('mon') && text.includes('sun'));
  const hasDay =
    text.includes('today') ||
    text.includes('tomorrow') ||
    text.includes('yesterday') ||
    text.includes('tonight') ||
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      text,
    );

  const hasNumberRequest =
    /\bnext\s+\d+\s+(events?|appointments?|meetings?)\b/.test(text) ||
    (text.includes('next') && /\b\d+\b/.test(text) && text.includes('event'));

  const hasPastNumberRequest =
    /\b(?:previous|last|past)\s+\d+\s+(?:events?|appointments?|meetings?)\b/.test(
      text,
    ) || /\b\d+\s+(?:previous|past)\s+events?\b/.test(text);

  const hasMonthWindow =
    text.includes('this month') ||
    text.includes('next month') ||
    text.includes('last month');

  const hasYearWindow =
    text.includes('this year') ||
    text.includes('next year') ||
    text.includes('last year') ||
    text.includes('for the year') ||
    text.includes('all year') ||
    text.includes('whole year') ||
    text.includes('entire year') ||
    text.includes('full year') ||
    /\bthe\s+year\b/.test(text);

  return (
    hasCalendarNoun &&
    hasListVerb &&
    (hasWeek ||
      hasMonthWindow ||
      hasYearWindow ||
      hasDay ||
      hasNumberRequest ||
      hasPastNumberRequest)
  );
}

export function isMonthListing(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('this month') ||
    text.includes('next month') ||
    text.includes('last month')
  );
}

/** 0 = this month, 1 = next, -1 = last */
export function extractMonthOffset(message: string): number {
  const text = message.toLowerCase();
  if (text.includes('next month')) return 1;
  if (text.includes('last month')) return -1;
  return 0;
}

export function isYearListing(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('this year') ||
    text.includes('next year') ||
    text.includes('last year') ||
    text.includes('for the year') ||
    text.includes('all year') ||
    text.includes('whole year') ||
    text.includes('entire year') ||
    text.includes('full year') ||
    /\bthe\s+year\b/.test(text)
  );
}

/** 0 = this calendar year, 1 = next, -1 = last (ambiguous phrases like “for the year” → this year). */
export function extractYearOffset(message: string): number {
  const text = message.toLowerCase();
  if (text.includes('next year')) return 1;
  if (text.includes('last year')) return -1;
  return 0;
}

export function isWeekListing(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('week') || (text.includes('mon') && text.includes('sun'));
}

export function extractWeekOffset(message: string): number {
  const text = message.toLowerCase();
  if (text.includes('last week')) return -1;
  if (text.includes('next week')) return 1;
  return 0;
}

export function isDayListing(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('today') ||
    text.includes('tomorrow') ||
    text.includes('yesterday') ||
    text.includes('tonight') ||
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      text,
    )
  );
}

export function extractDayOffset(message: string): number {
  const text = message.toLowerCase();
  if (text.includes('tomorrow')) return 1;
  if (text.includes('yesterday')) return -1;

  const nextDow = text.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (nextDow?.[1]) {
    const target = weekdayNameToNumber(nextDow[1]);
    const now = DateTime.now();
    const current = now.weekday;
    let diff = target - current;
    if (diff <= 0) diff += 7;
    return diff;
  }

  return 0;
}

/**
 * Parses "next 5 …" (upcoming) or "previous 4 …" / "last 3 …" (past).
 */
export function extractListedEventCount(message: string): number | null {
  const text = message.toLowerCase();
  const next = text.match(/\bnext\s+(\d+)\b/);
  if (next?.[1]) return Number(next[1]);
  const past = text.match(/\b(?:previous|last|past)\s+(\d+)\b/);
  if (past?.[1]) return Number(past[1]);
  const trailing = text.match(/\b(\d+)\s+(?:previous|past)\s+events?\b/);
  if (trailing?.[1]) return Number(trailing[1]);
  return null;
}

/** Past N events (excludes week phrases like "last week"). */
export function isPastCalendarListIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (/\bnext\s+\d+\b/.test(text)) return false;
  if (
    text.includes('last week') ||
    text.includes('previous week') ||
    text.includes('past week') ||
    text.includes('this week') ||
    text.includes('next week')
  ) {
    return false;
  }
  return (
    /\b(previous|last|past)\b/.test(text) &&
    /\d+/.test(text) &&
    (text.includes('event') ||
      text.includes('appointment') ||
      text.includes('meeting') ||
      text.includes('lined up') ||
      text.includes('calendar'))
  );
}

function weekdayNameToNumber(dayName: string): number {
  switch (dayName.toLowerCase()) {
    case 'monday':
      return 1;
    case 'tuesday':
      return 2;
    case 'wednesday':
      return 3;
    case 'thursday':
      return 4;
    case 'friday':
      return 5;
    case 'saturday':
      return 6;
    case 'sunday':
      return 7;
    default:
      return 1;
  }
}
