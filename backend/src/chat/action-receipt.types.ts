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

/** Tool handler reply: chat text plus optional receipt for the UI. */
export type ToolReplyPayload = {
  text: string;
  receipt?: ActionReceipt;
};

export type ToolReplyInput = string | ToolReplyPayload;

export function toolText(text: string): ToolReplyPayload {
  return { text };
}

export function toolOk(
  text: string,
  receipt: ActionReceipt,
): ToolReplyPayload {
  return { text, receipt };
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
