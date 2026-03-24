import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { EmailService } from '../integrations/email/email.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class ToolOrchestratorService {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
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
      const args = await this.extractCalendarEventArgs(message);
      if (!args) {
        return (
          'I can create that calendar event, but I need start and end time in ISO format ' +
          '(e.g. 2026-03-20T16:00:00.000Z).'
        );
      }

      try {
        const event = await this.calendarService.createEvent({
          sessionId,
          title: args.title,
          start: args.start,
          end: args.end,
          description: args.description,
          reminderMinutesBefore: args.reminderMinutesBefore,
        });

        return (
          `Event added to Google Calendar.\n\n` +
          `Title: ${event.title}\n` +
          `Start: ${event.start}\n` +
          `End: ${event.end}\n` +
          `Reminder (minutes before): ${
            event.reminderMinutesBefore !== undefined
              ? event.reminderMinutesBefore
              : 'none'
          }\n` +
          (event.url ? `Open: ${event.url}\n` : '') +
          `(event id: ${event.eventId})`
        );
      } catch (e: unknown) {
        return this.toolFailureMessage('create the calendar event', e);
      }
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

  private isCalendarCreateIntent(message: string): boolean {
    const text = message.toLowerCase();
    return (
      text.includes('create calendar') ||
      text.includes('schedule event') ||
      text.includes('set reminder') ||
      text.includes('add event')
    );
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

  private async extractCalendarEventArgs(message: string): Promise<{
    title: string;
    start: string;
    end: string;
    description?: string;
    reminderMinutesBefore?: number;
  } | null> {
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
- start and end must be ISO datetime strings if present.
- if either start or end cannot be determined, return null for that field.
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
