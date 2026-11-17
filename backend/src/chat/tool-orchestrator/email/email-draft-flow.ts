import type { LlmService } from '../../../llm/llm.service';
import {
  EMAIL_RECIPIENT_CONFIRM_PROMPT,
  toolConfirm,
  type ToolReplyInput,
} from '../../action-receipt.types';
import type {
  PendingRequest,
  PendingRequestService,
} from '../../pending-request.service';
import type { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import { extractDraftEmailArgs } from '../tool-orchestrator-llm-extractors';
import {
  createGmailDraft,
  type EmailDraftCreateDeps,
} from './email-draft-create';
import type { PendingEmailDraftPayload } from './email-draft.types';
import { extractEmail } from './email-utils';

export type EmailDraftFlowDeps = EmailDraftCreateDeps & {
  llmService: LlmService;
  pendingRequestService: PendingRequestService;
  sessionPreferences: SessionPreferencesService;
};

export async function startEmailDraft(
  deps: EmailDraftFlowDeps,
  sessionId: string,
  message: string,
  envelope?: IntentEnvelope,
  conversationId?: string,
): Promise<ToolReplyInput> {
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

  const emailInMessage = extractEmail(message);
  if (!recipients.length && emailInMessage) {
    recipients = [emailInMessage];
  }

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
    const args = await extractDraftEmailArgs(deps.llmService, message);

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

  if (!recipients.length && recipientName && context?.trim()) {
    const known = await deps.sessionPreferences.findEmailContact(
      sessionId,
      conversationId,
      recipientName,
    );
    if (known) {
      await deps.pendingRequestService.setPending<PendingEmailDraftPayload>(
        sessionId,
        {
          actionType: 'email_draft',
          originalMessage: message,
          payload: {
            recipients: [known.email],
            recipientName,
            subject,
            context,
            tone,
          },
          missingSlots: ['confirmation'],
          collectedSlots: {},
        },
      );

      return toolConfirm(
        `I have ${known.email} for ${recipientName} from earlier in this chat. Use that?`,
        EMAIL_RECIPIENT_CONFIRM_PROMPT,
      );
    }
  }

  if (!recipients.length || !context?.trim()) {
    await deps.pendingRequestService.setPending<PendingEmailDraftPayload>(
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

  return createGmailDraft(
    deps,
    sessionId,
    message,
    {
      recipients,
      subject,
      context,
      tone,
      recipientName,
    },
    conversationId,
  );
}

export async function continuePendingEmailDraft(
  deps: EmailDraftFlowDeps,
  sessionId: string,
  message: string,
  pendingDraft: PendingRequest<PendingEmailDraftPayload>,
  envelope?: IntentEnvelope,
  conversationId?: string,
): Promise<ToolReplyInput> {
  const slots = envelope?.slots ?? {};
  const emailFromMessage = extractEmail(message);
  const awaitingRecipientConfirm =
    pendingDraft.missingSlots.includes('confirmation');

  if (awaitingRecipientConfirm) {
    return continueRecipientConfirm(
      deps,
      sessionId,
      message,
      pendingDraft,
      envelope,
      emailFromMessage,
      conversationId,
    );
  }

  const recipients = emailFromMessage
    ? [emailFromMessage]
    : pendingDraft.payload.recipients?.length
      ? pendingDraft.payload.recipients
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
    await deps.pendingRequestService.setPending<PendingEmailDraftPayload>(
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
    await deps.pendingRequestService.setPending<PendingEmailDraftPayload>(
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

  await deps.pendingRequestService.clearPending(sessionId, 'email_draft');

  return createGmailDraft(
    deps,
    sessionId,
    pendingDraft.originalMessage,
    {
      recipients,
      subject,
      context,
      tone,
      recipientName: pendingDraft.payload.recipientName,
    },
    conversationId,
  );
}

async function continueRecipientConfirm(
  deps: EmailDraftFlowDeps,
  sessionId: string,
  message: string,
  pendingDraft: PendingRequest<PendingEmailDraftPayload>,
  envelope: IntentEnvelope | undefined,
  emailFromMessage: string | null,
  conversationId?: string,
): Promise<ToolReplyInput> {
  const wantsDifferent =
    envelope?.intent === 'pending_cancel' ||
    /\bdifferent(\s+address)?\b/i.test(message.trim()) ||
    /^cancel$/i.test(message.trim());

  if (wantsDifferent) {
    await deps.pendingRequestService.setPending<PendingEmailDraftPayload>(
      sessionId,
      {
        actionType: 'email_draft',
        originalMessage: pendingDraft.originalMessage,
        payload: {
          ...pendingDraft.payload,
          recipients: [],
        },
        missingSlots: ['recipientEmail'],
        collectedSlots: {},
      },
    );
    return pendingDraft.payload.recipientName
      ? `Got it. What email address should I use for ${pendingDraft.payload.recipientName}?`
      : 'Got it. What email address should I send it to?';
  }

  if (emailFromMessage) {
    await deps.pendingRequestService.clearPending(sessionId, 'email_draft');
    return createGmailDraft(
      deps,
      sessionId,
      pendingDraft.originalMessage,
      {
        recipients: [emailFromMessage],
        subject: pendingDraft.payload.subject,
        context: pendingDraft.payload.context ?? '',
        tone: pendingDraft.payload.tone,
        recipientName: pendingDraft.payload.recipientName,
      },
      conversationId,
    );
  }

  const affirmed =
    envelope?.intent === 'pending_confirm' ||
    /^(yes|y|use|ok|okay)$/i.test(message.trim());

  if (
    affirmed &&
    pendingDraft.payload.recipients?.length &&
    pendingDraft.payload.context?.trim()
  ) {
    await deps.pendingRequestService.clearPending(sessionId, 'email_draft');
    return createGmailDraft(
      deps,
      sessionId,
      pendingDraft.originalMessage,
      {
        recipients: pendingDraft.payload.recipients,
        subject: pendingDraft.payload.subject,
        context: pendingDraft.payload.context,
        tone: pendingDraft.payload.tone,
        recipientName: pendingDraft.payload.recipientName,
      },
      conversationId,
    );
  }

  const knownEmail = pendingDraft.payload.recipients?.[0];
  const name = pendingDraft.payload.recipientName;
  return toolConfirm(
    knownEmail && name
      ? `I have ${knownEmail} for ${name} from earlier in this chat. Use that?`
      : 'Should I use the email from earlier in this chat?',
    EMAIL_RECIPIENT_CONFIRM_PROMPT,
  );
}
