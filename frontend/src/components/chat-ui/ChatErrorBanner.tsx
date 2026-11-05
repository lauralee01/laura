type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ChatErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="mx-auto mb-1 flex w-full max-w-2xl shrink-0 items-start justify-between gap-3 rounded-[var(--radius-md)] border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
      <p className="min-w-0 leading-snug">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium text-danger underline-offset-2 transition hover:underline"
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
