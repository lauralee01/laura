'use client';

type Props = {
  title: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DraftDeleteDialog({
  title,
  deleting,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65"
        aria-label="Cancel delete"
        onClick={onCancel}
        disabled={deleting}
      />
      <div
        role="alertdialog"
        aria-labelledby="writing-desk-delete-title"
        className="relative w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft"
      >
        <h3
          id="writing-desk-delete-title"
          className="text-sm font-semibold text-ink"
        >
          Delete draft?
        </h3>
        <p className="mt-2 text-sm text-ink-muted">
          “{title}” will be removed from your Writing desk. This can’t be
          undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-[var(--radius-sm)] bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
