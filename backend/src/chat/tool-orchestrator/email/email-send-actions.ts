import type { EmailService } from '../../../integrations/email/email.service';
import {
  EMAIL_SEND_CONFIRM_PROMPT,
  toolConfirm,
  toolOk,
  type ToolReplyInput,
} from '../../action-receipt.types';
import type {
  PendingRequest,
  PendingRequestService,
} from '../../pending-request.service';
import type { SessionPreferencesService } from '../../session-preferences.service';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import { rememberDraft } from './email-draft-create';

export type EmailSendActionDeps = {
  emailService: EmailService;
  pendingRequestService: PendingRequestService;
  sessionPreferences: SessionPreferencesService;
};

export async function cancelPendingSendKeepDraft(
  deps: EmailSendActionDeps,
  sessionId: string,
  pendingSend: PendingRequest<PendingEmailSendPayload>,
): Promise<ToolReplyInput> {
  await rememberDraft(deps, sessionId, pendingSend.payload);
  await deps.pendingRequestService.clearPending(sessionId, 'email_send');
  return (
    'No problem — I won’t send it. The draft is still saved in Gmail if you want to review it later. ' +
    'Say “delete the draft” if you want me to remove it from Gmail.'
  );
}

export async function deleteRememberedDraft(
  deps: EmailSendActionDeps,
  sessionId: string,
): Promise<ToolReplyInput> {
  const pendingSend =
    await deps.pendingRequestService.getPending<PendingEmailSendPayload>(
      sessionId,
      'email_send',
    );
  const remembered =
    pendingSend?.payload ??
    (await deps.sessionPreferences.getLastEmailDraft(sessionId));

  if (!remembered?.draftId) {
    return (
      'I don’t have a recent Gmail draft from this chat to delete. ' +
      'You can still remove drafts directly in Gmail.'
    );
  }

  try {
    await deps.emailService.deleteDraft(sessionId, remembered.draftId);
    await deps.pendingRequestService.clearPending(sessionId, 'email_send');
    await deps.sessionPreferences.clearLastEmailDraft(sessionId);

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

export async function sendPendingEmailDraftNow(
  deps: EmailSendActionDeps,
  sessionId: string,
  pendingSend: PendingRequest<PendingEmailSendPayload>,
): Promise<ToolReplyInput> {
  try {
    await deps.emailService.sendDraft(
      sessionId,
      pendingSend.payload.draftId,
    );

    await deps.pendingRequestService.clearPending(sessionId, 'email_send');
    await deps.sessionPreferences.clearLastEmailDraft(sessionId);

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

export async function revisePendingEmailDraftNow(
  deps: EmailSendActionDeps,
  sessionId: string,
  pendingSend: PendingRequest<PendingEmailSendPayload>,
  message: string,
): Promise<ToolReplyInput> {
  try {
    const revised = await deps.emailService.reviseDraftEmail({
      sessionId,
      draftId: pendingSend.payload.draftId,
      recipients: pendingSend.payload.recipients,
      currentSubject: pendingSend.payload.subject,
      currentBody: pendingSend.payload.body,
      revisionInstruction: message,
    });

    await rememberDraft(deps, sessionId, {
      draftId: revised.draftId,
      recipients: revised.recipients,
      subject: revised.subject,
      body: revised.body,
    });

    await deps.pendingRequestService.setPending<PendingEmailSendPayload>(
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
