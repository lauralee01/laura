import type { EmailService } from '../../../integrations/email/email.service';
import {
  EMAIL_SEND_CONFIRM_PROMPT,
  toolOk,
  type ToolReplyInput,
} from '../../action-receipt.types';
import type { PendingRequestService } from '../../pending-request.service';
import type { SessionPreferencesService } from '../../session-preferences.service';
import type { LastEmailDraft } from '../../session-pending.types';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import { formatToolFailureMessage } from '../tool-orchestrator.utils';
import type { CreateGmailDraftArgs } from './email-draft.types';

export type EmailDraftCreateDeps = {
  emailService: EmailService;
  pendingRequestService: PendingRequestService;
  sessionPreferences: SessionPreferencesService;
};

export async function rememberDraft(
  deps: Pick<EmailDraftCreateDeps, 'sessionPreferences'>,
  sessionId: string,
  draft: Pick<LastEmailDraft, 'draftId' | 'recipients' | 'subject' | 'body'>,
): Promise<void> {
  await deps.sessionPreferences.setLastEmailDraft(sessionId, {
    draftId: draft.draftId,
    recipients: draft.recipients,
    subject: draft.subject,
    body: draft.body,
  });
}

export async function createGmailDraft(
  deps: EmailDraftCreateDeps,
  sessionId: string,
  originalMessage: string,
  args: CreateGmailDraftArgs,
  conversationId?: string,
): Promise<ToolReplyInput> {
  try {
    if (args.recipientName && args.recipients[0]) {
      await deps.sessionPreferences.upsertEmailContact(
        sessionId,
        conversationId,
        args.recipientName,
        args.recipients[0],
      );
    }

    const draft = await deps.emailService.draftEmail({
      sessionId,
      recipients: args.recipients,
      subject: args.subject,
      tone: args.tone,
      context: args.context,
    });

    await rememberDraft(deps, sessionId, {
      draftId: draft.draftId,
      recipients: draft.recipients,
      subject: draft.subject,
      body: draft.body,
    });

    await deps.pendingRequestService.setPending<PendingEmailSendPayload>(
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
