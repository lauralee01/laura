import type { MemoryItem } from '@/lib/memory-api';

type Props = {
  target: MemoryItem;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MemoryDeleteDialog({
  target,
  deleting,
  onCancel,
  onConfirm,
}: Props) {
  const preview =
    target.content.length > 120
      ? `${target.content.slice(0, 120)}…`
      : target.content;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-memory-title"
      aria-describedby="delete-memory-desc"
      onClick={() => !deleting && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="delete-memory-title"
          className="text-base font-semibold text-ink"
        >
          Delete memory?
        </h3>
        <p
          id="delete-memory-desc"
          className="mt-2 text-sm leading-relaxed text-ink-muted"
        >
          Laura will forget this:{' '}
          <span className="font-medium text-ink">“{preview}”</span>
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            className="rounded-[var(--radius-md)] px-3 py-2 text-sm text-ink-muted transition hover:bg-canvas-mid disabled:opacity-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            className="rounded-[var(--radius-md)] bg-danger px-3 py-2 text-sm font-medium text-surface-elevated transition hover:opacity-90 disabled:opacity-50"
            onClick={onConfirm}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
