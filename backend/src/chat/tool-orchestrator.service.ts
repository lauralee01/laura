import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { EmailService } from '../integrations/email/email.service';
import { LlmService } from '../llm/llm.service';
import { DateTime, IANAZone } from 'luxon';
import { debugCalendarLog } from '../integrations/calendar/calendar-debug';
import { SessionPreferencesService } from './session-preferences.service';
import { PendingRequestService } from './pending-request.service';

type CalendarArgs = {
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
};

type PendingCalendarCreatePayload = {
  message: string;
};

type CalendarListMode = 'week' | 'day' | 'upcoming' | 'past';

type PendingCalendarListPayload = {
  mode: CalendarListMode;
  weekOffset: number; // 0 = this week, 1 = next week, -1 = last week
  dayOffset?: number; // 0 = today, 1 = tomorrow, -1 = yesterday
  maxEvents?: number; // upcoming / past: how many events to show
};

@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly pendingRequestService: PendingRequestService,
  ) {}

  async tryHandle(sessionId: string, message: string): Promise<string | null> {
    if (this.isEmailDraftIntent(message)) {
      const args = await this.extractDraftEmailArgs(message);
      if (!args) {
        return 'I can draft that email, but I need at least one recipient email address (e.g. jordan@example.com).';
      }

      try {
        const draft = await this.emailService.draftEmail({
          sessionId,
          recipients: args.recipients,
          subject: args.subject,
          tone: args.tone,
          context: args.context,
        });

        return (
          `Draft saved in Gmail.\n\n` +
          `Recipients: ${draft.recipients.join(', ')}\n` +
          `Subject: ${draft.subject}\n\n` +
          `${draft.body}`
        );
      } catch (e: unknown) {
        return this.toolFailureMessage(
          'create the Gmail draft',
          e,
        );
      }
    }

    if (this.isCalendarListIntent(message)) {
      const tzCandidate = this.extractTimeZoneFromMessage(message);
      const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
      const timeZone = tzCandidate ?? storedTz;

      if (tzCandidate) {
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
          () => undefined,
        );
      }

      const weekOffset = this.extractWeekOffset(message);
      const weekListing = this.isWeekListing(message);
      const dayListing = this.isDayListing(message);
      const dayOffset = this.extractDayOffset(message);
      const listedCount = this.extractListedEventCount(message);
      const pastIntent = this.isPastCalendarListIntent(message);

      const pendingListRequest: PendingCalendarListPayload = weekListing
        ? { mode: 'week', weekOffset }
        : dayListing
          ? { mode: 'day', weekOffset: 0, dayOffset }
        : pastIntent
          ? { mode: 'past', weekOffset: 0, maxEvents: listedCount ?? 10 }
          : { mode: 'upcoming', weekOffset, maxEvents: listedCount ?? 10 };

      if (!timeZone) {
        this.pendingRequestService.setPending<PendingCalendarListPayload>(
          sessionId,
          {
            actionType: 'calendar_list',
            originalMessage: message,
            payload: pendingListRequest,
            missingSlots: ['timeZone'],
            collectedSlots: {},
          },
        );
        return (
          'What timezone should I use for your events?\n\n' +
          'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
        );
      }

      try {
        const nowLocal = DateTime.now().setZone(timeZone);
        const { startLocal, endLocal } =
          pendingListRequest.mode === 'week'
            ? this.getMonToSunRangeLocal(nowLocal, timeZone, weekOffset)
            : pendingListRequest.mode === 'day'
              ? this.getSingleDayRangeLocal(nowLocal, pendingListRequest.dayOffset ?? 0)
            : pendingListRequest.mode === 'past'
              ? this.getPastRangeLocal(nowLocal)
              : this.getUpcomingRangeLocal(nowLocal);

        debugCalendarLog('[tool-orchestrator.list] request', {
          mode: pendingListRequest.mode,
          timeZone,
          weekOffset,
          maxEvents:
            pendingListRequest.mode === 'upcoming' ||
            pendingListRequest.mode === 'past'
              ? pendingListRequest.maxEvents
              : undefined,
          rangeLocal: { start: startLocal, end: endLocal },
        });

        const maxFetch =
          pendingListRequest.mode === 'upcoming' ||
          pendingListRequest.mode === 'past'
            ? pendingListRequest.maxEvents
            : undefined;

        const events = await this.calendarService.listEvents({
          sessionId,
          timeZone,
          start: startLocal,
          end: endLocal,
          maxEvents:
            pendingListRequest.mode === 'past'
              ? undefined
              : maxFetch,
        });

        const formatList = (
          items: typeof events,
        ): string =>
          items
            .map((e) =>
              e.isAllDay
                ? `- ${e.title} — ${e.startText}${
                    e.endText ? ` to ${e.endText}` : ''
                  } (All-day)`
                : `- ${e.title} — ${e.startText}${
                    e.endText ? `–${e.endText}` : ''
                  }`,
            )
            .join('\n');

        if (pendingListRequest.mode === 'past') {
          const max = pendingListRequest.maxEvents ?? 10;
          const recent = events.slice(-max).reverse();
          if (recent.length === 0) {
            return `No past events found in ${timeZone} (searched about the last year up to now).`;
          }
          return (
            `Here are your last ${recent.length} events (${timeZone}), most recent first:\n\n` +
            formatList(recent)
          );
        }

        if (events.length === 0) {
          return pendingListRequest.mode === 'week'
            ? `No events found for that Mon–Sun week in ${timeZone}.`
            : pendingListRequest.mode === 'day'
              ? `No events found for ${this.describeDayWindow(nowLocal, pendingListRequest.dayOffset ?? 0)} in ${timeZone}.`
              : `No upcoming events found in ${timeZone}.`;
        }

        if (pendingListRequest.mode === 'week') {
          const range = this.formatMonToSunRange(nowLocal, weekOffset);
          return (
            `Here are your events for ${range} (${timeZone}):\n\n` +
            formatList(events)
          );
        }

        if (pendingListRequest.mode === 'day') {
          const dayText = this.describeDayWindow(
            nowLocal,
            pendingListRequest.dayOffset ?? 0,
          );
          return (
            `Here are your events for ${dayText} (${timeZone}):\n\n` +
            formatList(events)
          );
        }

        return (
          `Here are your next ${pendingListRequest.maxEvents ?? 10} events (${timeZone}):\n\n` +
          formatList(events)
        );
      } catch (e: unknown) {
        return this.toolFailureMessage('list calendar events', e);
      }
    }

    if (this.isCalendarCreateIntent(message)) {
      const tzCandidate = this.extractTimeZoneFromMessage(message);

      // If the user’s timezone is unknown, ask once and store the event request.
      const storedTz = await this.sessionPreferences.getTimeZone(sessionId);
      const timeZone = tzCandidate ?? storedTz;

      if (tzCandidate) {
        // Persist timezone immediately so subsequent scheduling requests don’t re-ask.
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate).catch(
          () => undefined,
        );
      }

      if (!timeZone) {
        this.pendingRequestService.setPending<PendingCalendarCreatePayload>(
          sessionId,
          {
            actionType: 'calendar_create',
            originalMessage: message,
            payload: { message },
            missingSlots: ['timeZone'],
            collectedSlots: {},
          },
        );
        return (
          'What timezone should I use for your events?\n\n' +
          'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
        );
      }

      try {
        // If we’re about to create immediately, clear any stale pending request.
        this.pendingRequestService.clearPending(sessionId, 'calendar_create');
        const args = await this.extractCalendarEventArgs(message, timeZone);
        if (!args) {
          return (
            `I can create that calendar event, but I need start and end time in your local time (${timeZone}). ` +
            `Example: March 26 12:00 to 13:00.`
          );
        }
        const event = await this.calendarService.createEvent({
          sessionId,
          title: args.title,
          start: args.start,
          end: args.end,
          description: args.description,
          reminderMinutesBefore: args.reminderMinutesBefore,
          timeZone,
        });

        return (
          `Event added to Google Calendar.\n\n` +
          `Title: ${event.title}\n` +
          `Time zone: ${timeZone}\n` +
          `Local start: ${args.start}\n` +
          `Local end: ${args.end}\n` +
          `Reminder (minutes before): ${
            event.reminderMinutesBefore !== undefined
              ? event.reminderMinutesBefore
              : 'none'
          }\n` +
          `Calendar: primary\n` +
          (event.url ? `Open: ${event.url}\n` : '') +
          `(event id: ${event.eventId})`
        );
      } catch (e: unknown) {
        return this.toolFailureMessage('create the calendar event', e);
      }
    }

    // Handle timezone-only messages (e.g. after we asked “what timezone…”).
    const tzCandidate = this.extractTimeZoneFromMessage(message);
    if (
      tzCandidate &&
      this.isTimeZoneSettingMessage(message, tzCandidate)
    ) {
      try {
        await this.sessionPreferences.setTimeZone(sessionId, tzCandidate);
      } catch (e: unknown) {
        return this.toolFailureMessage('set timezone', e);
      }

      const pending = this.pendingRequestService.getPending<PendingCalendarCreatePayload>(
        sessionId,
        'calendar_create',
      );
      if (pending) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_create');
        try {
          const args = await this.extractCalendarEventArgs(
            pending.payload.message,
            tzCandidate,
          );
          if (!args) {
            return `I saved your timezone as ${tzCandidate}, but I still need a valid start and end time to create the event.`;
          }

          const event = await this.calendarService.createEvent({
            sessionId,
            title: args.title,
            start: args.start,
            end: args.end,
            description: args.description,
            reminderMinutesBefore: args.reminderMinutesBefore,
            timeZone: tzCandidate,
          });
          return (
            `Event added to Google Calendar.\n\n` +
            `Title: ${event.title}\n` +
            `Time zone: ${tzCandidate}\n` +
            `Local start: ${args.start}\n` +
            `Local end: ${args.end}\n` +
            `Reminder (minutes before): ${
              event.reminderMinutesBefore !== undefined
                ? event.reminderMinutesBefore
                : 'none'
            }\n` +
            `Calendar: primary\n` +
            (event.url ? `Open: ${event.url}\n` : '') +
            `(event id: ${event.eventId})`
          );
        } catch (e: unknown) {
          return this.toolFailureMessage('create the calendar event', e);
        }
      }

      const pendingList = this.pendingRequestService.getPending<PendingCalendarListPayload>(
        sessionId,
        'calendar_list',
      );
      if (pendingList) {
        this.pendingRequestService.clearPending(sessionId, 'calendar_list');
        try {
          const nowLocal = DateTime.now().setZone(tzCandidate);
          const { startLocal, endLocal } =
            pendingList.payload.mode === 'week'
              ? this.getMonToSunRangeLocal(
                  nowLocal,
                  tzCandidate,
                  pendingList.payload.weekOffset,
                )
              : pendingList.payload.mode === 'day'
                ? this.getSingleDayRangeLocal(
                    nowLocal,
                    pendingList.payload.dayOffset ?? 0,
                  )
              : pendingList.payload.mode === 'past'
                ? this.getPastRangeLocal(nowLocal)
                : this.getUpcomingRangeLocal(nowLocal);

          const maxFetch =
            pendingList.payload.mode === 'upcoming' ||
            pendingList.payload.mode === 'past'
              ? pendingList.payload.maxEvents
              : undefined;

          const events = await this.calendarService.listEvents({
            sessionId,
            timeZone: tzCandidate,
            start: startLocal,
            end: endLocal,
            maxEvents:
              pendingList.payload.mode === 'past' ? undefined : maxFetch,
          });

          const formatList = (
            items: typeof events,
          ): string =>
            items
              .map((e) =>
                e.isAllDay
                  ? `- ${e.title} — ${e.startText}${
                      e.endText ? ` to ${e.endText}` : ''
                    } (All-day)`
                  : `- ${e.title} — ${e.startText}${
                      e.endText ? `–${e.endText}` : ''
                    }`,
              )
              .join('\n');

          if (pendingList.payload.mode === 'past') {
            const max = pendingList.payload.maxEvents ?? 10;
            const recent = events.slice(-max).reverse();
            if (recent.length === 0) {
              return `No past events found in ${tzCandidate} (searched about the last year up to now).`;
            }
            return (
              `Here are your last ${recent.length} events (${tzCandidate}), most recent first:\n\n` +
              formatList(recent)
            );
          }

          if (events.length === 0) {
            return pendingList.payload.mode === 'week'
              ? `No events found for that Mon–Sun week in ${tzCandidate}.`
              : pendingList.payload.mode === 'day'
                ? `No events found for ${this.describeDayWindow(nowLocal, pendingList.payload.dayOffset ?? 0)} in ${tzCandidate}.`
              : `No upcoming events found in ${tzCandidate}.`;
          }

          if (pendingList.payload.mode === 'week') {
            const range = this.formatMonToSunRange(
              nowLocal,
              pendingList.payload.weekOffset,
            );
            return (
              `Here are your events for ${range} (${tzCandidate}):\n\n` +
              formatList(events)
            );
          }

          if (pendingList.payload.mode === 'day') {
            const dayText = this.describeDayWindow(
              nowLocal,
              pendingList.payload.dayOffset ?? 0,
            );
            return (
              `Here are your events for ${dayText} (${tzCandidate}):\n\n` +
              formatList(events)
            );
          }

          return (
            `Here are your next ${pendingList.payload.maxEvents ?? 10} events (${tzCandidate}):\n\n` +
            formatList(events)
          );
        } catch (e: unknown) {
          return this.toolFailureMessage('list calendar events', e);
        }
      }

      return `Got it — I’ll schedule events in ${tzCandidate}.`;
    }

    return null;
  }

  private isEmailDraftIntent(message: string): boolean {
    const text = message.toLowerCase();
    if (text.includes('write email') || text.includes('compose email')) {
      return true;
    }
    // Broad: "draft another email", "draft an email", "draft email to x@..."
    // (tight regex missed "draft" + "another" + "email".)
    return text.includes('draft') && text.includes('email');
  }

  private isTimeZoneSettingMessage(message: string, timeZone: string): boolean {
    const trimmed = message.trim();
    const lower = message.toLowerCase();
    if (trimmed.toLowerCase() === timeZone.toLowerCase()) return true;

    // Common: user replies with extra context like "`America/Chicago` (Central)".
    // If they included a valid IANA timezone and the message is short, treat it as
    // setting their timezone even if they didn't say "timezone" explicitly.
    if (
      trimmed.toLowerCase().includes(timeZone.toLowerCase()) &&
      trimmed.length <= Math.max(48, timeZone.length + 24)
    ) {
      return true;
    }

    // Very lightweight heuristic: only treat it as a preference update if the user
    // signals intent to set timezone.
    return (
      lower.includes('timezone') ||
      lower.includes('time zone') ||
      lower.includes('use ') ||
      lower.startsWith('use ') ||
      lower.includes('my time')
    );
  }

  private extractTimeZoneFromMessage(message: string): string | null {
    const match = message.match(
      // Matches:
      // - "America/Chicago"
      // - case-insensitive variants like "america/chicago"
      // - "UTC"
      // - "Etc/GMT+1" style offsets
      /\b([A-Za-z]+(?:\/[A-Za-z0-9_\+\-]+)+|UTC)\b/i,
    );
    const raw = match?.[1];
    if (!raw) return null;

    const candidate = raw.toUpperCase() === 'UTC' ? 'UTC' : raw;
    if (IANAZone.isValidZone(candidate)) return candidate;

    // Try normalizing casing for the common cases where users type lowercase.
    // We normalize each path segment individually (e.g. "america/chicago" -> "America/Chicago").
    if (candidate.includes('/')) {
      const normalizeSegment = (seg: string): string => {
        const trimmed = seg.trim();
        const m = trimmed.match(/^([a-zA-Z]+)(.*)$/);
        if (!m) return trimmed;

        const prefixLower = m[1].toLowerCase();
        const rest = m[2];

        // Some segments (GMT/UTC) are conventionally all-caps.
        const prefix =
          prefixLower === 'gmt' || prefixLower === 'utc'
            ? prefixLower.toUpperCase()
            : prefixLower.charAt(0).toUpperCase() + prefixLower.slice(1);

        return prefix + rest;
      };

      const normalized = candidate
        .split('/')
        .map((seg) => normalizeSegment(seg))
        .join('/');

      if (IANAZone.isValidZone(normalized)) return normalized;
    }

    return null;
  }

  private isCalendarCreateIntent(message: string): boolean {
    const text = message.toLowerCase();

    const hasMonthName = /january|february|march|april|may|june|july|august|september|october|november|december/.test(
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

    // Heuristic: treat as calendar creation if the message looks like it contains
    // a date+time *and* the user either uses scheduling language or mentions
    // calendar-oriented nouns (event/meeting/appointment/visit/reminder).
    return hasDateTimeHint && (hasSchedulingVerb || hasCalendarNoun);
  }

  private isCalendarListIntent(message: string): boolean {
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

    const hasWeek = text.includes('week') || (text.includes('mon') && text.includes('sun'));
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

    return (
      hasCalendarNoun &&
      hasListVerb &&
      (hasWeek || hasDay || hasNumberRequest || hasPastNumberRequest)
    );
  }

  private isWeekListing(message: string): boolean {
    const text = message.toLowerCase();
    return text.includes('week') || (text.includes('mon') && text.includes('sun'));
  }

  private extractWeekOffset(message: string): number {
    const text = message.toLowerCase();
    if (text.includes('last week')) return -1;
    if (text.includes('next week')) return 1;
    return 0;
  }

  private isDayListing(message: string): boolean {
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

  private extractDayOffset(message: string): number {
    const text = message.toLowerCase();
    if (text.includes('tomorrow')) return 1;
    if (text.includes('yesterday')) return -1;

    const nextDow = text.match(
      /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    );
    if (nextDow?.[1]) {
      const target = this.weekdayNameToNumber(nextDow[1]);
      const now = DateTime.now();
      const current = now.weekday; // 1..7
      let diff = target - current;
      if (diff <= 0) diff += 7;
      return diff;
    }

    return 0; // today / tonight / fallback
  }

  /**
   * Parses "next 5 …" (upcoming) or "previous 4 …" / "last 3 …" (past).
   */
  private extractListedEventCount(message: string): number | null {
    const text = message.toLowerCase();
    const next = text.match(/\bnext\s+(\d+)\b/);
    if (next?.[1]) return Number(next[1]);
    const past = text.match(/\b(?:previous|last|past)\s+(\d+)\b/);
    if (past?.[1]) return Number(past[1]);
    const trailing = text.match(/\b(\d+)\s+(?:previous|past)\s+events?\b/);
    if (trailing?.[1]) return Number(trailing[1]);
    return null;
  }

  /**
   * "Previous / last / past N events" (not "next N", not week-based listings like "last week").
   */
  private isPastCalendarListIntent(message: string): boolean {
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

  private getMonToSunRangeLocal(
    nowLocal: DateTime,
    timeZone: string,
    weekOffset: number,
  ): { startLocal: string; endLocal: string } {
    // Luxon weekday: 1(Mon) ... 7(Sun)
    const weekday = nowLocal.weekday;
    const daysSinceMonday = weekday - 1;
    const startOfThisWeek = nowLocal
      .minus({ days: daysSinceMonday })
      .startOf('day');

    const startLocal = startOfThisWeek
      .plus({ days: weekOffset * 7 })
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");

    // endLocal is exclusive: next Monday 00:00
    const endLocal = startOfThisWeek
      .plus({ days: (weekOffset + 1) * 7 })
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");

    return { startLocal, endLocal };
  }

  /** Day window in local time, [start, next-day-start). */
  private getSingleDayRangeLocal(
    nowLocal: DateTime,
    dayOffset: number,
  ): { startLocal: string; endLocal: string } {
    const start = nowLocal
      .startOf('day')
      .plus({ days: dayOffset })
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");
    const end = nowLocal
      .startOf('day')
      .plus({ days: dayOffset + 1 })
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");
    return { startLocal: start, endLocal: end };
  }

  /**
   * Window for "what already happened": roughly the last year through "now"
   * (exclusive end is the current instant for Google’s timeMax).
   */
  private getPastRangeLocal(
    nowLocal: DateTime,
  ): { startLocal: string; endLocal: string } {
    const startLocal = nowLocal
      .minus({ days: 365 })
      .startOf('day')
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");
    const endLocal = nowLocal.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    return { startLocal, endLocal };
  }

  private getUpcomingRangeLocal(
    nowLocal: DateTime,
  ): { startLocal: string; endLocal: string } {
    // Use a bounded future window to avoid unbounded event lists.
    // We include the rest of "today" (from 00:00) since "next events" is usually
    // interpreted as "next in your schedule" rather than "after the current clock time".
    const startLocal = nowLocal.startOf('day').toFormat(
      "yyyy-MM-dd'T'HH:mm:ss",
    );
    // For "next N events", a 6 month window can be too short. Use ~1 year.
    const endLocal = nowLocal
      .plus({ days: 365 })
      .toFormat("yyyy-MM-dd'T'HH:mm:ss");
    return { startLocal, endLocal };
  }

  private formatMonToSunRange(
    nowLocal: DateTime,
    weekOffset: number,
  ): string {
    const weekday = nowLocal.weekday;
    const daysSinceMonday = weekday - 1;
    const startOfThisWeek = nowLocal
      .minus({ days: daysSinceMonday })
      .startOf('day');

    const start = startOfThisWeek.plus({ days: weekOffset * 7 });
    const endInclusive = startOfThisWeek
      .plus({ days: (weekOffset + 1) * 7 })
      .minus({ milliseconds: 1 });

    return `${start.toFormat('MMM d, yyyy')} – ${endInclusive.toFormat('MMM d, yyyy')}`;
  }

  private describeDayWindow(nowLocal: DateTime, dayOffset: number): string {
    if (dayOffset === 0) return 'today';
    if (dayOffset === 1) return 'tomorrow';
    if (dayOffset === -1) return 'yesterday';
    return nowLocal.plus({ days: dayOffset }).toFormat('ccc, MMM d, yyyy');
  }

  private weekdayNameToNumber(dayName: string): number {
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

  private async extractDraftEmailArgs(message: string): Promise<{
    recipients: string[];
    subject?: string;
    tone?: string;
    context: string;
  } | null> {
    const prompt = `
Extract email draft arguments from the user message.
Return JSON only with this exact schema:
{
  "recipients": string[],
  "subject": string | null,
  "tone": string | null,
  "context": string
}

Rules:
- recipients must include only real email addresses found in the message.
- if no email address is present, return recipients: [].
- context: what to say in plain language (as if instructing a writer). Do not use the phrase "the recipient"; name people or describe the ask directly.
- subject: optional short subject if the user implied one; otherwise null.
`.trim();

    const raw = await this.llmService.generate({
      systemPrompt: prompt,
      userMessage: message,
    });
    const parsed = this.safeParseObject(raw);
    if (!parsed) return null;

    const recipientsUnknown = parsed['recipients'];
    const contextUnknown = parsed['context'];
    if (!Array.isArray(recipientsUnknown) || typeof contextUnknown !== 'string')
      return null;

    const recipients = recipientsUnknown.filter(
      (v): v is string => typeof v === 'string',
    );
    if (recipients.length === 0) return null;

    const subjectUnknown = parsed['subject'];
    const toneUnknown = parsed['tone'];

    return {
      recipients,
      subject: typeof subjectUnknown === 'string' ? subjectUnknown : undefined,
      tone: typeof toneUnknown === 'string' ? toneUnknown : undefined,
      context: contextUnknown,
    };
  }

  private async extractCalendarEventArgs(
    message: string,
    timeZone: string,
  ): Promise<{
    title: string;
    start: string;
    end: string;
    description?: string;
    reminderMinutesBefore?: number;
  } | null> {
    const todayInZone = DateTime.now().setZone(timeZone).toISODate(); // YYYY-MM-DD

    const prompt = `
Extract calendar event arguments from the user message.
Return JSON only with this exact schema:
{
  "title": string,
  "start": string | null,
  "end": string | null,
  "description": string | null,
  "reminderMinutesBefore": number | null
}

Rules:
- Today's date in ${timeZone} is ${todayInZone}.
- If the user provides a month+day (like "March 26") without a year, choose the NEXT occurrence of that date on/after today's date (${todayInZone}).
- start and end must be ISO datetime strings representing LOCAL time in ${timeZone}.
- Use this exact format: YYYY-MM-DDTHH:mm:ss (NO trailing 'Z' and NO timezone offset like '+01:00').
- If the user provides a start time but does not provide an end time, set end = start + 1 hour.
- If start cannot be determined, return null for both start and end.
- title should be short and clear.
`.trim();

    const raw = await this.llmService.generate({
      systemPrompt: prompt,
      userMessage: message,
    });
    const parsed = this.safeParseObject(raw);
    if (!parsed) return null;

    const title = parsed['title'];
    const start = parsed['start'];
    const end = parsed['end'];
    const description = parsed['description'];
    const reminder = parsed['reminderMinutesBefore'];

    if (
      typeof title !== 'string' ||
      typeof start !== 'string' ||
      typeof end !== 'string'
    ) {
      return null;
    }

    return {
      title,
      start,
      end,
      description: typeof description === 'string' ? description : undefined,
      reminderMinutesBefore:
        typeof reminder === 'number' ? reminder : undefined,
    };
  }

  private toolFailureMessage(action: string, err: unknown): string {
    if (err instanceof BadRequestException) {
      return `I couldn’t ${action}. ${err.message}`;
    }
    if (err instanceof Error) {
      return `I couldn’t ${action}. ${err.message}`;
    }
    return `I couldn’t ${action}. Please try again.`;
  }

  private safeParseObject(raw: string): Record<string, unknown> | null {
    try {
      const jsonUnknown: unknown = JSON.parse(raw);
      if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
      return jsonUnknown as Record<string, unknown>;
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
        return null;
      try {
        const slice = raw.slice(firstBrace, lastBrace + 1);
        const jsonUnknown: unknown = JSON.parse(slice);
        if (typeof jsonUnknown !== 'object' || jsonUnknown === null)
          return null;
        return jsonUnknown as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
}
