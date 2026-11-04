type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ChatErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-red-200/90 bg-red-50/90 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
      <p className="min-w-0 text-center">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-200"
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
