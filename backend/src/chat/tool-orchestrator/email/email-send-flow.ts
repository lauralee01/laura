import {
  EMAIL_SEND_CONFIRM_PROMPT,
  toolConfirm,
  type ToolReplyInput,
} from '../../action-receipt.types';
import type {
  PendingRequest,
  PendingRequestService,
} from '../../pending-request.service';
import type { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import {
  cancelPendingSendKeepDraft,
  deleteRememberedDraft,
  revisePendingEmailDraftNow,
  sendPendingEmailDraftNow,
  type EmailSendActionDeps,
} from './email-send-actions';
import { isEmailDraftDeleteRequest } from './email-utils';

export type EmailSendFlowDeps = EmailSendActionDeps & {
  pendingRequestService: PendingRequestService;
  sessionPreferences: SessionPreferencesService;
};

export async function handlePendingEmailSendTurn(
  deps: EmailSendFlowDeps,
  sessionId: string,
  message: string,
  envelope?: IntentEnvelope,
): Promise<ToolReplyInput | null> {
  const pendingSend =
    await deps.pendingRequestService.getPending<PendingEmailSendPayload>(
      sessionId,
      'email_send',
    );

  if (!pendingSend) return null;

  if (
    envelope?.intent === 'pending_cancel' ||
    isEmailDraftDeleteRequest(message, envelope)
  ) {
    if (isEmailDraftDeleteRequest(message, envelope)) {
      return deleteRememberedDraft(deps, sessionId);
    }
    return cancelPendingSendKeepDraft(deps, sessionId, pendingSend);
  }

  if (envelope?.intent === 'email_send_confirm') {
    return sendPendingEmailDraftNow(deps, sessionId, pendingSend);
  }

  if (envelope?.intent === 'email_draft_revise') {
    return revisePendingEmailDraftNow(deps, sessionId, pendingSend, message);
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
export async function handleEmailDraftFollowUp(
  deps: EmailSendFlowDeps,
  sessionId: string,
  message: string,
  envelope: IntentEnvelope,
): Promise<ToolReplyInput> {
  if (isEmailDraftDeleteRequest(message, envelope)) {
    return deleteRememberedDraft(deps, sessionId);
  }

  if (envelope.intent === 'email_draft_revise') {
    const pendingSend =
      await deps.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );
    if (pendingSend) {
      return revisePendingEmailDraftNow(
        deps,
        sessionId,
        pendingSend,
        message,
      );
    }

    const remembered =
      await deps.sessionPreferences.getLastEmailDraft(sessionId);
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
      return revisePendingEmailDraftNow(deps, sessionId, synthetic, message);
    }

    return (
      'I don’t have a recent draft in this chat to revise. ' +
      'Tell me who to email and what it should say, and I’ll draft a new one.'
    );
  }

  return deleteRememberedDraft(deps, sessionId);
}
