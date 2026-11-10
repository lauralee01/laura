import type { ConfirmPrompt } from '@/lib/confirm-prompt';

type Props = {
  prompt: ConfirmPrompt;
  disabled?: boolean;
  onConfirm: (text: string) => void;
  onCancel: (text: string) => void;
};

export function ConfirmChipStrip({
  prompt,
  disabled,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Confirm or cancel"
    >
      <button
        type="button"
        className="laura-chip rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => onConfirm(prompt.confirmText)}
      >
        {prompt.confirmLabel}
      </button>
      <button
        type="button"
        className="laura-chip rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => onCancel(prompt.cancelText)}
      >
        {prompt.cancelLabel}
      </button>
    </div>
  );
}
