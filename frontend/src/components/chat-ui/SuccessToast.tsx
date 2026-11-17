type Props = {
  message: string;
  onDismiss: () => void;
  /** Stacking order when multiple panels may show toasts. */
  zClassName?: string;
};

export function SuccessToast({
  message,
  onDismiss,
  zClassName = 'z-[80]',
}: Props) {
  return (
    <div
      role="status"
      className={`fixed top-4 left-1/2 ${zClassName} max-w-md -translate-x-1/2 rounded-[var(--radius-lg)] border border-success/30 bg-success-soft px-4 py-3 text-sm shadow-soft`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-snug text-ink">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
