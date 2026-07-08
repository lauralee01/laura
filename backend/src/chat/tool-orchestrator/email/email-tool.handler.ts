import { Injectable } from '@nestjs/common';
import { EmailService } from '../../../integrations/email/email.service';
import { LlmService } from '../../../llm/llm.service';
import { PendingRequestService } from '../../pending-request.service';
import { extractDraftEmailArgs } from '../tool-orchestrator-llm-extractors';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type { IntentEnvelope } from '../../intent/intent.types';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import type { PendingRequest } from '../../pending-request.service';

type PendingEmailDraftPayload = {
  recipients?: string[];
  recipientName?: string;
  subject?: string;
  context?: string;
  tone?: string;
};

@Injectable()
export class EmailToolHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly pendingRequestService: PendingRequestService,
  ) { }

  async handleEmailDraftIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const pendingDraft =
      this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return this.continuePendingEmailDraft(sessionId, message, pendingDraft, envelope);
    }

    const args = await extractDraftEmailArgs(this.llmService, message);
    const slots = envelope?.slots ?? {};

    const recipients =
      args?.recipients?.length
        ? args.recipients
        : typeof slots.recipientEmail === 'string'
          ? [slots.recipientEmail]
          : [];

    const recipientName =
      typeof slots.recipient === 'string' ? slots.recipient : undefined;

    const subject =
      args?.subject ??
      (typeof slots.subject === 'string' ? slots.subject : undefined);

    const context =
      args?.context ??
      (typeof slots.body === 'string' ? slots.body : undefined);

    const tone = args?.tone;

    if (!recipients.length || !context?.trim()) {
      this.pendingRequestService.setPending<PendingEmailDraftPayload>(
        sessionId,
        {
          actionType: 'email_draft',
          originalMessage: message,
          payload: {
            recipients,
            recipientName,
            subject,
            context,
            tone,
          },
          missingSlots: !recipients.length ? ['recipientEmail'] : ['body'],
          collectedSlots: {},
        },
      );

      if (!recipients.length) {
        return (
          'I can draft that email, but I need the recipient email address first.'
        );
      }

      return 'I have the recipient. What should the email say?';
    }

    return this.createGmailDraft(sessionId, message, {
      recipients,
      subject,
      context,
      tone,
    });
  }

  private async continuePendingEmailDraft(
    sessionId: string,
    message: string,
    pendingDraft: PendingRequest<PendingEmailDraftPayload>,
    envelope?: IntentEnvelope,
  ): Promise<string> {
    const slots = envelope?.slots ?? {};
    const emailFromMessage = this.extractEmail(message);

    const recipients =
      pendingDraft.payload.recipients?.length
        ? pendingDraft.payload.recipients
        : emailFromMessage
          ? [emailFromMessage]
          : typeof slots.recipientEmail === 'string'
            ? [slots.recipientEmail]
            : [];

    const context =
      pendingDraft.payload.context ??
      (typeof slots.body === 'string' ? slots.body : undefined) ??
      (!emailFromMessage ? message : undefined);

    const subject =
      pendingDraft.payload.subject ??
      (typeof slots.subject === 'string' ? slots.subject : undefined);

    const tone = pendingDraft.payload.tone;

    if (!recipients.length) {
      this.pendingRequestService.setPending<PendingEmailDraftPayload>(
        sessionId,
        {
          actionType: 'email_draft',
          originalMessage: pendingDraft.originalMessage,
          payload: {
            ...pendingDraft.payload,
            context,
          },
          missingSlots: ['recipientEmail'],
          collectedSlots: {},
        },
      );

      return 'Got it. What email address should I send it to?';
    }

    if (!context?.trim()) {
      this.pendingRequestService.setPending<PendingEmailDraftPayload>(
        sessionId,
        {
          actionType: 'email_draft',
          originalMessage: pendingDraft.originalMessage,
          payload: {
            ...pendingDraft.payload,
            recipients,
          },
          missingSlots: ['body'],
          collectedSlots: {},
        },
      );

      return 'Got it. What should the email say?';
    }

    this.pendingRequestService.clearPending(sessionId, 'email_draft');

    return this.createGmailDraft(sessionId, pendingDraft.originalMessage, {
      recipients,
      subject,
      context,
      tone,
    });
  }

  private async createGmailDraft(
    sessionId: string,
    originalMessage: string,
    args: {
      recipients: string[];
      subject?: string;
      context: string;
      tone?: string;
    },
  ): Promise<string> {
    try {
      const draft = await this.emailService.draftEmail({
        sessionId,
        recipients: args.recipients,
        subject: args.subject,
        tone: args.tone,
        context: args.context,
      });

      this.pendingRequestService.setPending<PendingEmailSendPayload>(
        sessionId,
        {
          actionType: 'email_send',
          originalMessage,
          payload: {
            draftId: draft.draftId,
            recipients: draft.recipients,
            subject: draft.subject,
            body: draft.body,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
        },
      );

      return (
        `I drafted this email in Gmail.\n\n` +
        `To: ${draft.recipients.join(', ')}\n` +
        `Subject: ${draft.subject}\n\n` +
        `${draft.body}\n\n` +
        `---\n` +
        `Want me to send it? Reply send or yes, or tell me what you’d like changed.`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the Gmail draft', e);
    }
  }

  async handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<string | null> {
    const pendingSend =
      this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (!pendingSend) return null;

    if (envelope?.intent === 'pending_cancel') {
      this.pendingRequestService.clearPending(sessionId, 'email_send');
      return (
        'Okay — I won’t send that draft from here. ' +
        'It’s still in your Gmail drafts if you want to send or edit it there.'
      );
    }

    if (envelope?.intent === 'email_send_confirm') {
      return this.sendPendingEmailDraftNow(sessionId, pendingSend);
    }

    if (envelope?.intent === 'email_draft_revise') {
      return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
    }

    return (
      'I still have a draft ready to send:\n' +
      `To: ${pendingSend.payload.recipients.join(', ')}\n` +
      `Subject: ${pendingSend.payload.subject}\n\n` +
      `${pendingSend.payload.body}\n\n` +
      'Reply send or yes to send it now, describe a change, or cancel.'
    );
  }

  async tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<string | null> {
    const pendingDraft =
      this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return this.continuePendingEmailDraft(sessionId, message, pendingDraft, envelope);
    }

    const pendingSend =
      this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (pendingSend) {
      if (envelope.intent === 'pending_cancel') {
        this.pendingRequestService.clearPending(sessionId, 'email_send');
        return (
          'No problem — I won’t send it. The draft is still saved in Gmail if you want to review it later.'
        );
      }

      if (envelope.intent === 'email_send_confirm') {
        return this.sendPendingEmailDraftNow(sessionId, pendingSend);
      }

      if (envelope.intent === 'email_draft_revise') {
        return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
      }

      if (envelope.intent === 'email_draft') {
        this.pendingRequestService.clearPending(sessionId, 'email_send');
        return this.handleEmailDraftIntent(sessionId, message, envelope);
      }

      return null;
    }

    if (envelope.intent === 'email_draft') {
      return this.handleEmailDraftIntent(sessionId, message, envelope);
    }

    return null;
  }

  private async sendPendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
  ): Promise<string> {
    try {
      const sent = await this.emailService.sendDraft(
        sessionId,
        pendingSend.payload.draftId,
      );

      this.pendingRequestService.clearPending(sessionId, 'email_send');

      return (
        `Done — your email has been sent.\n\n` +
        `To: ${pendingSend.payload.recipients.join(', ')}\n` +
        `Subject: ${pendingSend.payload.subject}`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('send the email', e);
    }
  }

  private async revisePendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
    message: string,
  ): Promise<string> {
    try {
      const revised = await this.emailService.reviseDraftEmail({
        sessionId,
        draftId: pendingSend.payload.draftId,
        recipients: pendingSend.payload.recipients,
        currentSubject: pendingSend.payload.subject,
        currentBody: pendingSend.payload.body,
        revisionInstruction: message,
      });

      this.pendingRequestService.setPending<PendingEmailSendPayload>(
        sessionId,
        {
          actionType: 'email_send',
          originalMessage: pendingSend.originalMessage,
          payload: {
            draftId: revised.draftId,
            recipients: revised.recipients,
            subject: revised.subject,
            body: revised.body,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
        },
      );

      return (
        `I updated the draft for you.\n\n` +
        `To: ${revised.recipients.join(', ')}\n` +
        `Subject: ${revised.subject}\n\n` +
        `${revised.body}\n\n` +
        `---\n` +
        `Want me to send this version? Reply send or yes, or ask for another change.`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('update the Gmail draft', e);
    }
  }

  private extractEmail(value: string): string | null {
    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? null;
  }
}