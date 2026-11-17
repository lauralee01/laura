'use client';

import { MemoryDeleteDialog } from './memory-browser/MemoryDeleteDialog';
import { MemoryListItem } from './memory-browser/MemoryListItem';
import { MemorySuccessToast } from './memory-browser/MemorySuccessToast';
import { useMemoryBrowser } from './memory-browser/useMemoryBrowser';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionReady: boolean;
};

export function MemoryBrowserPanel({ open, onClose, sessionReady }: Props) {
  const {
    memories,
    loading,
    error,
    editingId,
    editDraft,
    setEditDraft,
    savingId,
    deleteTarget,
    setDeleteTarget,
    deleting,
    editSavedFlash,
    deleteSavedFlash,
    clearEditFlash,
    clearDeleteFlash,
    startEdit,
    cancelEdit,
    saveEdit,
    confirmDelete,
  } = useMemoryBrowser(open, sessionReady);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-browser-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[1px]"
        aria-label="Close memories"
        onClick={onClose}
      />

      {editSavedFlash ? (
        <MemorySuccessToast
          message="Memory updated."
          onDismiss={clearEditFlash}
        />
      ) : null}

      {deleteSavedFlash ? (
        <MemorySuccessToast
          message="Memory deleted."
          onDismiss={clearDeleteFlash}
        />
      ) : null}

      <aside className="relative flex h-full w-full max-w-[24rem] flex-col border-l border-border-subtle bg-surface shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="min-w-0">
            <h2
              id="memory-browser-title"
              className="text-sm font-semibold text-ink"
            >
              Memories
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              What Laura remembers about you
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="mb-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            </div>
          ) : null}

          {!loading && memories.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-muted">
              Nothing remembered yet. Facts you share in chat may show up here.
            </p>
          ) : null}

          {!loading && memories.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {memories.map((item) => (
                <MemoryListItem
                  key={item.id}
                  item={item}
                  isEditing={editingId === item.id}
                  editDraft={editDraft}
                  saving={savingId === item.id}
                  onEditDraftChange={setEditDraft}
                  onStartEdit={() => startEdit(item)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => void saveEdit()}
                  onRequestDelete={() => setDeleteTarget(item)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </aside>

      {deleteTarget ? (
        <MemoryDeleteDialog
          target={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
