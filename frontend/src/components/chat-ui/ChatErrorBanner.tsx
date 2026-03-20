type Props = { message: string };

export function ChatErrorBanner({ message }: Props) {
  return (
    <div className="shrink-0 border-t border-red-200/90 bg-red-50/90 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
      {message}
    </div>
  );
}
