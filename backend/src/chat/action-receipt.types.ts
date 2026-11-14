/**
 * Structured confirmation for a completed tool action (shown in the chat UI).
 * Ephemeral for the live turn — not persisted with message history (v1).
 */
export type ActionReceiptKind =
  | 'email_draft'
  | 'email_sent'
  | 'email_draft_deleted'
  | 'calendar_created'
  | 'calendar_updated'
  | 'calendar_deleted';

export type ActionReceipt = {
  kind: ActionReceiptKind;
  title: string;
  detail?: string;
};

/**
 * Inline Confirm/Cancel chips for yes/no pending tool turns.
 * Ephemeral for the live turn — not persisted with message history (v1).
 * Chip click submits confirmText / cancelText as a normal user message.
 */
export type ConfirmPromptKind =
  | 'email_send'
  | 'calendar_delete'
  | 'email_recipient';

export type ConfirmPrompt = {
  kind: ConfirmPromptKind;
  confirmLabel: string;
  cancelLabel: string;
  confirmText: string;
  cancelText: string;
};

export const EMAIL_SEND_CONFIRM_PROMPT: ConfirmPrompt = {
  kind: 'email_send',
  confirmLabel: 'Send',
  cancelLabel: 'Cancel',
  confirmText: 'send',
  cancelText: 'cancel',
};

export const CALENDAR_DELETE_CONFIRM_PROMPT: ConfirmPrompt = {
  kind: 'calendar_delete',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  confirmText: 'yes',
  cancelText: 'cancel',
};

export const EMAIL_RECIPIENT_CONFIRM_PROMPT: ConfirmPrompt = {
  kind: 'email_recipient',
  confirmLabel: 'Use',
  cancelLabel: 'Different address',
  confirmText: 'yes',
  cancelText: 'different address',
};

/** Tool handler reply: chat text plus optional receipt / confirm chips for the UI. */
export type ToolReplyPayload = {
  text: string;
  receipt?: ActionReceipt;
  confirmPrompt?: ConfirmPrompt;
};

export type ToolReplyInput = string | ToolReplyPayload;

export function toolText(text: string): ToolReplyPayload {
  return { text };
}

export function toolOk(
  text: string,
  receipt: ActionReceipt,
  confirmPrompt?: ConfirmPrompt,
): ToolReplyPayload {
  return confirmPrompt ? { text, receipt, confirmPrompt } : { text, receipt };
}

export function toolConfirm(
  text: string,
  confirmPrompt: ConfirmPrompt,
): ToolReplyPayload {
  return { text, confirmPrompt };
}

export function coerceToolReply(
  value: ToolReplyInput | null | undefined,
): ToolReplyPayload | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return { text: value };
  }
  return value;
}
