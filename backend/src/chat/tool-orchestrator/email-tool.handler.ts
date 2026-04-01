import { Injectable } from '@nestjs/common';
import { EmailService } from '../../integrations/email/email.service';
import { LlmService } from '../../llm/llm.service';
import { PendingRequestService } from '../pending-request.service';
import { extractDraftEmailArgs } from './tool-orchestrator-llm-extractors';
import { formatToolFailureMessage } from './tool-orchestrator.utils';
import type { IntentEnvelope } from '../intent/intent.types';
import type { PendingEmailSendPayload } from './tool-orchestrator.types';
import type { PendingRequest } from '../pending-request.service';

/**
 * Gmail draft + send / revise / cancel while `email_send` is pending.
 * LLM is used only to extract structured draft args from free text.
 */
@Injectable()
export class EmailToolHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly pendingRequestService: PendingRequestService,
  ) {}

  async handleEmailDraftIntent(
    sessionId: string,
    message: string,
  ): Promise<string> {
    const args = await extractDraftEmailArgs(this.llmService, message);
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

      this.pendingRequestService.setPending<PendingEmailSendPayload>(
        sessionId,
        {
          actionType: 'email_send',
          originalMessage: message,
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
        `Draft saved in Gmail.\n\n` +
        `Recipients: ${draft.recipients.join(', ')}\n` +
        `Subject: ${draft.subject}\n\n` +
        `${draft.body}\n\n` +
        `---\n` +
        `Send it? Reply send or yes to send from your Gmail now, or say how you’d like it revised, or cancel to skip sending (the draft stays in Gmail).`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('create the Gmail draft', e);
    }
  }

  /**
   * When a Gmail draft is waiting for send/revise/cancel. Returns null if no pending email_send.
   */
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
      'Reply send or yes to send it now, or describe how you’d like the draft changed, or cancel to dismiss this prompt (the draft stays in Gmail).'
    );
  }

  /** Stage-1 email routing with envelope intent and slots only. */
  async tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
  ): Promise<string | null> {
    const pendingSend =
      this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (pendingSend) {
      if (envelope.intent === 'pending_cancel') {
        this.pendingRequestService.clearPending(sessionId, 'email_send');
        return (
          'Okay — I won’t send that draft from here. ' +
          'It’s still in your Gmail drafts if you want to send or edit it there.'
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
        return this.handleEmailDraftIntent(sessionId, message);
      }
      return null;
    }

    if (envelope.intent === 'email_draft') {
      return this.handleEmailDraftIntent(sessionId, message);
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
        `Email sent from your Gmail.\n\n` +
        `To: ${pendingSend.payload.recipients.join(', ')}\n` +
        `Subject: ${pendingSend.payload.subject}\n` +
        (sent.messageId ? `Message id: ${sent.messageId}\n` : '')
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
        `Updated your Gmail draft.\n\n` +
        `Recipients: ${revised.recipients.join(', ')}\n` +
        `Subject: ${revised.subject}\n\n` +
        `${revised.body}\n\n` +
        `---\n` +
        `Send it? Reply send or yes to send from your Gmail now, or ask for another change, or cancel to skip sending (the draft stays in Gmail).`
      );
    } catch (e: unknown) {
      return formatToolFailureMessage('update the Gmail draft', e);
    }
  }
}
