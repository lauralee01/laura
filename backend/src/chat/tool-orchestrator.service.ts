import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { EmailService } from '../integrations/email/email.service';
import { LlmService } from '../llm/llm.service';
import { DateTime, IANAZone } from 'luxon';
import { SessionPreferencesService } from './session-preferences.service';

type CalendarArgs = {
  title: string;
  start: string;
  end: string;
  description?: string;
  reminderMinutesBefore?: number;
};

type PendingCalendarRequest = {
  message: string;
};

@Injectable()
export class ToolOrchestratorService {
  private readonly pendingCalendarBySession =
    new Map<string, PendingCalendarRequest>();

  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly sessionPreferences: SessionPreferencesService,
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
        this.pendingCalendarBySession.set(sessionId, { message });
        return (
          'What timezone should I use for your events?\n\n' +
          'Please reply with an IANA timezone like `America/Chicago` (Central), `America/New_York` (Eastern), or `America/Los_Angeles` (Pacific).'
        );
      }

      try {
        // If we’re about to create immediately, clear any stale pending request.
        this.pendingCalendarBySession.delete(sessionId);
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

      const pending = this.pendingCalendarBySession.get(sessionId);
      if (pending) {
        this.pendingCalendarBySession.delete(sessionId);
        try {
          const args = await this.extractCalendarEventArgs(pending.message, tzCandidate);
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
