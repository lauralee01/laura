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

const RECEIPT_KINDS = new Set<string>([
  'email_draft',
  'email_sent',
  'email_draft_deleted',
  'calendar_created',
  'calendar_updated',
  'calendar_deleted',
]);

export function parseActionReceipt(value: unknown): ActionReceipt | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as { kind?: unknown; title?: unknown; detail?: unknown };
  if (typeof raw.kind !== 'string' || !RECEIPT_KINDS.has(raw.kind)) {
    return undefined;
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    return undefined;
  }

  const detail =
    typeof raw.detail === 'string' && raw.detail.trim()
      ? raw.detail.trim()
      : undefined;

  return {
    kind: raw.kind as ActionReceiptKind,
    title: raw.title.trim(),
    detail,
  };
}
