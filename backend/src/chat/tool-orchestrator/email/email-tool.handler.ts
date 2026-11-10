import { Injectable } from '@nestjs/common';
import { EmailService } from '../../../integrations/email/email.service';
import { LlmService } from '../../../llm/llm.service';
import {
  EMAIL_SEND_CONFIRM_PROMPT,
  toolOk,
  toolConfirm,
  type ToolReplyInput,
} from '../../action-receipt.types';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import { extractDraftEmailArgs } from '../tool-orchestrator-llm-extractors';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type { IntentEnvelope } from '../../intent/intent.types';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import type { PendingRequest } from '../../pending-request.service';
import type { LastEmailDraft } from '../../session-pending.types';

type PendingEmailDraftPayload = {
  recipients?: string[];
  recipientName?: string;
  subject?: string;
  context?: string;
  tone?: string;
};

/** True when the user wants the Gmail draft removed, not just send cancelled. */
export function isEmailDraftDeleteRequest(
  message: string,
  envelope?: IntentEnvelope,
): boolean {
  if (envelope?.intent === 'email_draft_delete') {
    return true;
  }

  const action = envelope?.slots?.action;
  if (
    typeof action === 'string' &&
    /\b(delete|remove|discard|trash)\b/i.test(action)
  ) {
    return true;
  }

  return /\b(delete|remove|discard|trash)\b[\s\S]{0,40}\bdraft\b|\bcancel (the )?draft\b/i.test(
    message,
  );
}

@Injectable()
export class EmailToolHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) { }

  async handleEmailDraftIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    const pendingDraft =
      await this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return this.continuePendingEmailDraft(sessionId, message, pendingDraft, envelope);
    }

    /*
     * Slot-first: Stage-1 recipientEmail / body / subject win. Call the
     * extract LLM only for gaps (including name-only asks with no @).
     */
    const slots = envelope?.slots ?? {};

    let recipients =
      typeof slots.recipientEmail === 'string' && slots.recipientEmail.trim()
        ? [slots.recipientEmail.trim()]
        : Array.isArray(slots.recipientEmails)
          ? slots.recipientEmails.filter(
              (v): v is string => typeof v === 'string' && v.includes('@'),
            )
          : [];

    let recipientName =
      typeof slots.recipient === 'string' && slots.recipient.trim()
        ? slots.recipient.trim()
        : undefined;

    let subject =
      typeof slots.subject === 'string' && slots.subject.trim()
        ? slots.subject.trim()
        : undefined;

    let context =
      typeof slots.body === 'string' && slots.body.trim()
        ? slots.body.trim()
        : undefined;

    let tone: string | undefined;

    /*
     * Extract only when Stage-1 left real gaps. Name + body without an
     * address is enough to pending — do not spend an LLM call inventing @.
     */
    const slotFirstReadyToPending =
      Boolean(context?.trim()) &&
      (recipients.length > 0 || Boolean(recipientName));

    if (!slotFirstReadyToPending) {
      const args = await extractDraftEmailArgs(this.llmService, message);

      if (!recipients.length && args?.recipients?.length) {
        recipients = args.recipients;
      }
      if (!recipientName && args?.recipientName) {
        recipientName = args.recipientName;
      }
      if (!subject && args?.subject) {
        subject = args.subject;
      }
      if (!context && args?.context) {
        context = args.context;
      }
      if (args?.tone) {
        tone = args.tone;
      }
    }

    if (!recipients.length || !context?.trim()) {
      await this.pendingRequestService.setPending<PendingEmailDraftPayload>(
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
        return recipientName
          ? `I can draft that for ${recipientName}, but I need their email address first.`
          : 'I can draft that email, but I need the recipient email address first.';
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
  ): Promise<ToolReplyInput> {
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
      await this.pendingRequestService.setPending<PendingEmailDraftPayload>(
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
      await this.pendingRequestService.setPending<PendingEmailDraftPayload>(
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

    await this.pendingRequestService.clearPending(sessionId, 'email_draft');

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
  ): Promise<ToolReplyInput> {
    try {
      const draft = await this.emailService.draftEmail({
        sessionId,
        recipients: args.recipients,
        subject: args.subject,
        tone: args.tone,
        context: args.context,
      });

      await this.rememberDraft(sessionId, {
        draftId: draft.draftId,
        recipients: draft.recipients,
        subject: draft.subject,
        body: draft.body,
      });

      await this.pendingRequestService.setPending<PendingEmailSendPayload>(
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

      const text =
        `I drafted this email in Gmail.\n\n` +
        `To: ${draft.recipients.join(', ')}\n` +
        `Subject: ${draft.subject}\n\n` +
        `${draft.body}\n\n` +
        `---\n` +
        `Want me to send it? Reply send or yes, or tell me what you’d like changed.`;

      return toolOk(
        text,
        {
          kind: 'email_draft',
          title: 'Draft saved in Gmail',
          detail: `To: ${draft.recipients.join(', ')} · Subject: ${draft.subject}`,
        },
        EMAIL_SEND_CONFIRM_PROMPT,
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the Gmail draft', e);
    }
  }

  async handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    const pendingSend =
      await this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (!pendingSend) return null;

    if (
      envelope?.intent === 'pending_cancel' ||
      isEmailDraftDeleteRequest(message, envelope)
    ) {
      if (isEmailDraftDeleteRequest(message, envelope)) {
        return this.deleteRememberedDraft(sessionId, message, envelope);
      }
      return this.cancelPendingSendKeepDraft(sessionId, pendingSend);
    }

    if (envelope?.intent === 'email_send_confirm') {
      return this.sendPendingEmailDraftNow(sessionId, pendingSend);
    }

    if (envelope?.intent === 'email_draft_revise') {
      return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
    }

    return toolConfirm(
      'I still have a draft ready to send:\n' +
        `To: ${pendingSend.payload.recipients.join(', ')}\n` +
        `Subject: ${pendingSend.payload.subject}\n\n` +
        `${pendingSend.payload.body}\n\n` +
        'Reply send or yes to send it now, describe a change, or cancel.',
      EMAIL_SEND_CONFIRM_PROMPT,
    );
  }

  /**
   * Delete / revise routes that must never fall through to the chat LLM
   * (which would hallucinate Gmail changes).
   */
  async handleEmailDraftFollowUp(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    if (isEmailDraftDeleteRequest(message, envelope)) {
      return this.deleteRememberedDraft(sessionId, message, envelope);
    }

    if (envelope.intent === 'email_draft_revise') {
      const pendingSend =
        await this.pendingRequestService.getPending<PendingEmailSendPayload>(
          sessionId,
          'email_send',
        );
      if (pendingSend) {
        return this.revisePendingEmailDraftNow(
          sessionId,
          pendingSend,
          message,
        );
      }

      const remembered = await this.sessionPreferences.getLastEmailDraft(
        sessionId,
      );
      if (remembered) {
        const synthetic: PendingRequest<PendingEmailSendPayload> = {
          actionType: 'email_send',
          originalMessage: message,
          payload: {
            draftId: remembered.draftId,
            recipients: remembered.recipients,
            subject: remembered.subject,
            body: remembered.body,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
          createdAt: remembered.updatedAt,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        return this.revisePendingEmailDraftNow(
          sessionId,
          synthetic,
          message,
        );
      }

      return (
        'I don’t have a recent draft in this chat to revise. ' +
        'Tell me who to email and what it should say, and I’ll draft a new one.'
      );
    }

    return this.deleteRememberedDraft(sessionId, message, envelope);
  }

  async tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    const pendingDraft =
      await this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return this.continuePendingEmailDraft(sessionId, message, pendingDraft, envelope);
    }

    const pendingSend =
      await this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (pendingSend) {
      if (
        envelope.intent === 'pending_cancel' ||
        isEmailDraftDeleteRequest(message, envelope)
      ) {
        if (isEmailDraftDeleteRequest(message, envelope)) {
          return this.deleteRememberedDraft(sessionId, message, envelope);
        }
        return this.cancelPendingSendKeepDraft(sessionId, pendingSend);
      }

      if (envelope.intent === 'email_send_confirm') {
        return this.sendPendingEmailDraftNow(sessionId, pendingSend);
      }

      if (envelope.intent === 'email_draft_revise') {
        return this.revisePendingEmailDraftNow(sessionId, pendingSend, message);
      }

      if (envelope.intent === 'email_draft') {
        await this.pendingRequestService.clearPending(sessionId, 'email_send');
        return this.handleEmailDraftIntent(sessionId, message, envelope);
      }

      return null;
    }

    if (
      envelope.intent === 'email_draft_delete' ||
      envelope.intent === 'email_draft_revise' ||
      isEmailDraftDeleteRequest(message, envelope)
    ) {
      return this.handleEmailDraftFollowUp(sessionId, message, envelope);
    }

    if (envelope.intent === 'email_draft') {
      return this.handleEmailDraftIntent(sessionId, message, envelope);
    }

    return null;
  }

  private async cancelPendingSendKeepDraft(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
  ): Promise<ToolReplyInput> {
    await this.rememberDraft(sessionId, pendingSend.payload);
    await this.pendingRequestService.clearPending(sessionId, 'email_send');
    return (
      'No problem — I won’t send it. The draft is still saved in Gmail if you want to review it later. ' +
      'Say “delete the draft” if you want me to remove it from Gmail.'
    );
  }

  private async deleteRememberedDraft(
    sessionId: string,
    _message: string,
    _envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput> {
    const pendingSend =
      await this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );
    const remembered =
      pendingSend?.payload ??
      (await this.sessionPreferences.getLastEmailDraft(sessionId));

    if (!remembered?.draftId) {
      return (
        'I don’t have a recent Gmail draft from this chat to delete. ' +
        'You can still remove drafts directly in Gmail.'
      );
    }

    try {
      await this.emailService.deleteDraft(sessionId, remembered.draftId);
      await this.pendingRequestService.clearPending(sessionId, 'email_send');
      await this.sessionPreferences.clearLastEmailDraft(sessionId);

      const to = remembered.recipients.join(', ');
      const subject = remembered.subject;
      const detailParts = [
        to ? `To: ${to}` : null,
        subject ? `Subject: ${subject}` : null,
      ].filter(Boolean);
      const text =
        `Done — I deleted that draft from Gmail` +
        (detailParts.length ? ` (${detailParts.join(' · ')})` : '') +
        '.';

      return toolOk(text, {
        kind: 'email_draft_deleted',
        title: 'Draft deleted from Gmail',
        detail: detailParts.join(' · ') || undefined,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('delete the Gmail draft', e);
    }
  }

  private async rememberDraft(
    sessionId: string,
    draft: Pick<
      LastEmailDraft,
      'draftId' | 'recipients' | 'subject' | 'body'
    >,
  ): Promise<void> {
    await this.sessionPreferences.setLastEmailDraft(sessionId, {
      draftId: draft.draftId,
      recipients: draft.recipients,
      subject: draft.subject,
      body: draft.body,
    });
  }

  private async sendPendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
  ): Promise<ToolReplyInput> {
    try {
      await this.emailService.sendDraft(
        sessionId,
        pendingSend.payload.draftId,
      );

      await this.pendingRequestService.clearPending(sessionId, 'email_send');
      await this.sessionPreferences.clearLastEmailDraft(sessionId);

      const to = pendingSend.payload.recipients.join(', ');
      const subject = pendingSend.payload.subject;
      const text =
        `Done — your email has been sent.\n\n` +
        `To: ${to}\n` +
        `Subject: ${subject}`;

      return toolOk(text, {
        kind: 'email_sent',
        title: 'Email sent',
        detail: `To: ${to} · Subject: ${subject}`,
      });
    } catch (e: unknown) {
      return formatToolFailureMessage('send the email', e);
    }
  }

  private async revisePendingEmailDraftNow(
    sessionId: string,
    pendingSend: PendingRequest<PendingEmailSendPayload>,
    message: string,
  ): Promise<ToolReplyInput> {
    try {
      const revised = await this.emailService.reviseDraftEmail({
        sessionId,
        draftId: pendingSend.payload.draftId,
        recipients: pendingSend.payload.recipients,
        currentSubject: pendingSend.payload.subject,
        currentBody: pendingSend.payload.body,
        revisionInstruction: message,
      });

      await this.rememberDraft(sessionId, {
        draftId: revised.draftId,
        recipients: revised.recipients,
        subject: revised.subject,
        body: revised.body,
      });

      await this.pendingRequestService.setPending<PendingEmailSendPayload>(
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

      return toolConfirm(
        `I updated the draft for you.\n\n` +
          `To: ${revised.recipients.join(', ')}\n` +
          `Subject: ${revised.subject}\n\n` +
          `${revised.body}\n\n` +
          `---\n` +
          `Want me to send this version? Reply send or yes, or ask for another change.`,
        EMAIL_SEND_CONFIRM_PROMPT,
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