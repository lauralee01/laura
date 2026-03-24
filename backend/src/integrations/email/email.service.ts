import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
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

@Injectable()
export class EmailService {
  constructor(private readonly googleOAuth: GoogleOAuthService) {}

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

    const subject = input.subject?.trim() || this.buildDefaultSubject(context);

    const body =
      `Hi there,\n\n` +
      `(${tone}) ${context}\n\n` +
      `Next step: please reply with approval or any edits you want.\n\n` +
      `Best,\nLaura`;

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
    const snippet = trimmed.slice(0, 40);
    return snippet.length > 0
      ? `Re: ${snippet}${snippet.length >= 40 ? '…' : ''}`
      : 'Draft';
  }
}
