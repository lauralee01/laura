'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteMemory,
  listMemories,
  updateMemory,
  type MemoryItem,
} from '@/lib/memory-api';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionReady: boolean;
};

function formatMemoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MemoryBrowserPanel({ open, onClose, sessionReady }: Props) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await listMemories();
      setMemories(items);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not load memories.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditDraft('');
      setDeleteTarget(null);
      setError(null);
      return;
    }
    void load();
  }, [open, load]);

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditDraft(item.content);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async () => {
    if (editingId === null) {
      return;
    }
    const content = editDraft.trim();
    if (!content) {
      setError('Memory text cannot be empty.');
      return;
    }

    setSavingId(editingId);
    setError(null);
    try {
      const updated = await updateMemory(editingId, content);
      setMemories((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      setEditingId(null);
      setEditDraft('');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save memory.',
      );
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteMemory(deleteTarget.id);
      setMemories((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) {
        cancelEdit();
      }
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not delete memory.',
      );
    } finally {
      setDeleting(false);
    }
  };

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
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
        aria-label="Close memories"
        onClick={onClose}
      />

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
              {memories.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li
                    key={item.id}
                    className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated/80 px-3 py-2.5"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={4}
                          className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/50"
                          disabled={savingId === item.id}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-canvas-mid disabled:opacity-50"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            className="rounded-[var(--radius-md)] bg-accent px-2.5 py-1.5 text-xs font-medium text-surface-elevated transition hover:bg-accent-hover disabled:opacity-50"
                            onClick={() => void saveEdit()}
                          >
                            {savingId === item.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {item.content}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-ink-muted">
                            {formatMemoryDate(item.createdAt)}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium text-danger transition hover:bg-danger-soft"
                              onClick={() => setDeleteTarget(item)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </aside>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[1px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-memory-title"
          aria-describedby="delete-memory-desc"
          onClick={() => !deleting && setDeleteTarget(null)}
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
              <span className="font-medium text-ink">
                “
                {deleteTarget.content.length > 120
                  ? `${deleteTarget.content.slice(0, 120)}…`
                  : deleteTarget.content}
                ”
              </span>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm text-ink-muted transition hover:bg-canvas-mid disabled:opacity-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                className="rounded-[var(--radius-md)] bg-danger px-3 py-2 text-sm font-medium text-surface-elevated transition hover:opacity-90 disabled:opacity-50"
                onClick={() => void confirmDelete()}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
