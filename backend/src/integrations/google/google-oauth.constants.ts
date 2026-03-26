/**
 * Default OAuth scopes when GOOGLE_OAUTH_SCOPES is unset.
 * Gmail compose + Calendar events + listing calendars (calendarList.list).
 */
export const DEFAULT_GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  // Required for `calendar.calendarList.list` (enumerate calendars).
  // `calendar.events` alone does not include this.
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');
