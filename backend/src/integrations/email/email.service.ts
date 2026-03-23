import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
  async draftEmail(input: DraftEmailInput): Promise<DraftEmailOutput> {
    const recipients = input.recipients.map((r) => r.trim()).filter((r) => r);
    if (recipients.length === 0) {
      throw new Error('recipients must not be empty');
    }

    const tone = input.tone?.trim() || 'professional and friendly';
    const context = input.context.trim();
    if (!context) {
      throw new Error('context must not be empty');
    }

    const subject = input.subject?.trim() || this.buildDefaultSubject(context);

    // Stub-first: deterministic body construction so we can test tool wiring
    // without OAuth or provider dependencies yet.
    const body =
      `Hi there,\\n\\n` +
      `(${tone}) ${context}\\n\\n` +
      `Next step: please reply with approval or any edits you want.\\n\\n` +
      `Best,\\nLaura`;

    return {
      draftId: randomUUID(),
      recipients,
      subject,
      body,
    };
  }

  private buildDefaultSubject(context: string): string {
    const trimmed = context.replace(/\s+/g, ' ').trim();
    const snippet = trimmed.slice(0, 40);
    return snippet.length > 0
      ? `Re: ${snippet}${snippet.length >= 40 ? '…' : ''}`
      : 'Draft';
  }
}
