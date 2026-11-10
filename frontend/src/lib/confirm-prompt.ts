export type ConfirmPromptKind = 'email_send' | 'calendar_delete';

export type ConfirmPrompt = {
  kind: ConfirmPromptKind;
  confirmLabel: string;
  cancelLabel: string;
  confirmText: string;
  cancelText: string;
};

const CONFIRM_KINDS = new Set<string>(['email_send', 'calendar_delete']);

export function parseConfirmPrompt(
  value: unknown,
): ConfirmPrompt | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as {
    kind?: unknown;
    confirmLabel?: unknown;
    cancelLabel?: unknown;
    confirmText?: unknown;
    cancelText?: unknown;
  };

  if (typeof raw.kind !== 'string' || !CONFIRM_KINDS.has(raw.kind)) {
    return undefined;
  }
  if (typeof raw.confirmLabel !== 'string' || !raw.confirmLabel.trim()) {
    return undefined;
  }
  if (typeof raw.cancelLabel !== 'string' || !raw.cancelLabel.trim()) {
    return undefined;
  }
  if (typeof raw.confirmText !== 'string' || !raw.confirmText.trim()) {
    return undefined;
  }
  if (typeof raw.cancelText !== 'string' || !raw.cancelText.trim()) {
    return undefined;
  }

  return {
    kind: raw.kind as ConfirmPromptKind,
    confirmLabel: raw.confirmLabel.trim(),
    cancelLabel: raw.cancelLabel.trim(),
    confirmText: raw.confirmText.trim(),
    cancelText: raw.cancelText.trim(),
  };
}
