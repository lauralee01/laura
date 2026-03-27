import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { LlmService } from '../../llm/llm.service';
import { GoogleOAuthService } from '../google/google-oauth.service';

export type DraftEmailInput = {
  sessionId?: string;
  recipients: string[];
  subject?: string;
  tone?: string;
  context: string;
};

export type DraftEmailOutput = {
  draftId: string;
  recipients: string[];
  subject: string;
  body: string;
};

export type SendDraftOutput = {
  messageId: string;
  threadId?: string;
};

export type ReviseDraftEmailInput = {
  sessionId: string;
  draftId: string;
  recipients: string[];
  currentSubject: string;
  currentBody: string;
  revisionInstruction: string;
};

@Injectable()
export class EmailService {
  constructor(
    private readonly googleOAuth: GoogleOAuthService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Builds the email body, then creates a real **Gmail draft** via the Gmail API.
   */
  async draftEmail(input: DraftEmailInput): Promise<DraftEmailOutput> {
    const recipients = input.recipients.map((r) => r.trim()).filter((r) => r);
    if (recipients.length === 0) {
      throw new BadRequestException('recipients must not be empty');
    }

    const tone = input.tone?.trim() || 'professional and friendly';
    const context = input.context.trim();
    if (!context) {
      throw new BadRequestException('context must not be empty');
    }

    const composed = await this.composeDraftWithLlm({
      recipients,
      subject: input.subject?.trim(),
      tone,
      context,
    });
    const subject = composed.subject;
    const body = composed.body;

    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException(
        'sessionId is required to create a Gmail draft.',
      );
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = this.encodeRfc822PlainText({
      to: recipients,
      subject,
      body,
    });

    try {
      const { data } = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw },
        },
      });

      const draftId = data.id ?? '';

      return {
        draftId,
        recipients,
        subject,
        body,
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Gmail API error';
      throw new BadRequestException(
        `Could not create Gmail draft: ${detail}`,
      );
    }
  }

  /**
   * Sends an existing Gmail draft via the Gmail API (`users.drafts.send`).
   * Requires the same OAuth session used to create the draft.
   */
  async sendDraft(
    sessionId: string,
    draftId: string,
  ): Promise<SendDraftOutput> {
    const sid = sessionId?.trim();
    if (!sid) {
      throw new BadRequestException(
        'sessionId is required to send a Gmail draft.',
      );
    }
    const id = draftId?.trim();
    if (!id) {
      throw new BadRequestException('draftId is required to send.');
    }

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sid);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const { data } = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id },
      });

      return {
        messageId: data.id ?? '',
        threadId: data.threadId ?? undefined,
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Gmail API error';
      throw new BadRequestException(`Could not send Gmail draft: ${detail}`);
    }
  }

  /**
   * Rewrites the pending draft with the LLM and updates the same Gmail draft
   * (`users.drafts.update`) so the user can iterate before sending.
   */
  async reviseDraftEmail(
    input: ReviseDraftEmailInput,
  ): Promise<DraftEmailOutput> {
    const draftId = input.draftId?.trim();
    if (!draftId) {
      throw new BadRequestException('draftId is required to revise a draft.');
    }
    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException(
        'sessionId is required to update a Gmail draft.',
      );
    }
    const recipients = input.recipients.map((r) => r.trim()).filter((r) => r);
    if (recipients.length === 0) {
      throw new BadRequestException('recipients must not be empty');
    }
    const instruction = input.revisionInstruction.trim();
    if (!instruction) {
      throw new BadRequestException('revision instruction must not be empty');
    }

    const composed = await this.composeRevisionWithLlm({
      recipients,
      currentSubject: input.currentSubject,
      currentBody: input.currentBody,
      revisionInstruction: instruction,
    });

    const subject = composed.subject;
    const body = composed.body;

    const auth = await this.googleOAuth.getOAuth2ClientForSession(sessionId);
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = this.encodeRfc822PlainText({
      to: recipients,
      subject,
      body,
    });

    try {
      await gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: {
          message: { raw },
        },
      });

      return {
        draftId,
        recipients,
        subject,
        body,
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Gmail API error';
      throw new BadRequestException(
        `Could not update Gmail draft: ${detail}`,
      );
    }
  }

  private async composeRevisionWithLlm(input: {
    recipients: string[];
    currentSubject: string;
    currentBody: string;
    revisionInstruction: string;
  }): Promise<{ subject: string; body: string }> {
    const systemPrompt = `
You revise plain-text email drafts. Reply with JSON only (no markdown code fences):
{"subject":"...","body":"..."}

Rules:
- Apply the user's revision request to the draft. Keep recipients implied by context; do not add "To:" lines in the body.
- subject: one line, under 90 characters.
- body: plain text only, ready to send. Preserve a natural sign-off ending with "Laura" on its own line unless the revision explicitly asks to change the signature.
- Do not put "Subject:" in the body.
`.trim();

    const userMessage = [
      `Recipients: ${input.recipients.join(', ')}`,
      `Current subject: ${input.currentSubject}`,
      `Current body:\n${input.currentBody}`,
      `Revision request: ${input.revisionInstruction}`,
    ].join('\n\n');

    try {
      const raw = await this.llm.generate({ systemPrompt, userMessage });
      const parsed = this.safeParseObject(raw);
      if (!parsed) {
        return {
          subject: input.currentSubject.replace(/\r?\n/g, ' '),
          body: input.currentBody.trim(),
        };
      }

      const subjectUnknown = parsed['subject'];
      const bodyUnknown = parsed['body'];
      if (typeof bodyUnknown !== 'string' || !bodyUnknown.trim()) {
        return {
          subject: input.currentSubject.replace(/\r?\n/g, ' '),
          body: input.currentBody.trim(),
        };
      }

      const body = bodyUnknown.trim();
      const subjectFromModel =
        typeof subjectUnknown === 'string' ? subjectUnknown.trim() : '';
      const subject =
        subjectFromModel ||
        input.currentSubject.replace(/\r?\n/g, ' ') ||
        'Draft';

      return {
        subject: subject.replace(/\r?\n/g, ' '),
        body,
      };
    } catch {
      return {
        subject: input.currentSubject.replace(/\r?\n/g, ' '),
        body: input.currentBody.trim(),
      };
    }
  }

  private async composeDraftWithLlm(input: {
    recipients: string[];
    subject?: string;
    tone: string;
    context: string;
  }): Promise<{ subject: string; body: string }> {
    const systemPrompt = `
You write plain-text email drafts. Reply with JSON only (no markdown code fences):
{"subject":"...","body":"..."}

Rules:
- subject: one line, under 90 characters. Do not end with "..." as padding.
- body: plain text only, ready to send. No meta-instructions, no stage directions in parentheses, and no labels like "(professional and friendly)".
- Match the requested tone without naming it.
- Greeting: infer a first name from the email local part when reasonable (e.g. ms.martha247 -> Hi Martha, jane.doe -> Hi Jane). Otherwise use "Hi there,".
- Do not use "the recipient" as a placeholder; use a real name from the email or a natural greeting.
- Do not include lines about "Next step", "reply with approval", or internal review.
- Sign off with a short closing, then "Laura" on its own line.
- Do not put "Subject:" in the body.
`.trim();

    const userMessage = [
      input.subject
        ? `Use this exact subject line: ${input.subject}`
        : 'No fixed subject — choose a short, clear subject line.',
      `Recipients: ${input.recipients.join(', ')}`,
      `Tone: ${input.tone}`,
      `What the email should communicate: ${input.context}`,
    ].join('\n');

    try {
      const raw = await this.llm.generate({ systemPrompt, userMessage });
      const parsed = this.safeParseObject(raw);
      if (!parsed) {
        return this.fallbackDraft(input);
      }

      const subjectUnknown = parsed['subject'];
      const bodyUnknown = parsed['body'];
      if (typeof bodyUnknown !== 'string' || !bodyUnknown.trim()) {
        return this.fallbackDraft(input);
      }

      const body = bodyUnknown.trim();
      const subjectFromModel =
        typeof subjectUnknown === 'string' ? subjectUnknown.trim() : '';
      const subject =
        input.subject?.trim() ||
        subjectFromModel ||
        this.buildDefaultSubject(input.context);

      return {
        subject: subject.replace(/\r?\n/g, ' '),
        body,
      };
    } catch {
      return this.fallbackDraft(input);
    }
  }

  private fallbackDraft(input: {
    recipients: string[];
    subject?: string;
    tone: string;
    context: string;
  }): { subject: string; body: string } {
    const subject =
      input.subject?.trim() || this.buildDefaultSubject(input.context);
    return {
      subject,
      body:
        `Hi there,\n\n` +
        `${input.context.trim()}\n\n` +
        `Best,\nLaura`,
    };
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

  /**
   * Gmail expects base64url-encoded **raw** RFC 2822 message bytes.
   */
  private encodeRfc822PlainText(opts: {
    to: string[];
    subject: string;
    body: string;
  }): string {
    const lines = [
      `To: ${opts.to.join(', ')}`,
      `Subject: ${opts.subject.replace(/\r?\n/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.body,
    ];

    const rfc = lines.join('\r\n');

    return Buffer.from(rfc, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private buildDefaultSubject(context: string): string {
    const trimmed = context.replace(/\s+/g, ' ').trim();
    if (!trimmed) return 'Draft';
    const max = 72;
    if (trimmed.length <= max) return trimmed;
    const slice = trimmed.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > 32 ? slice.slice(0, lastSpace) : slice.trimEnd();
    return `${cut}…`;
  }
}
