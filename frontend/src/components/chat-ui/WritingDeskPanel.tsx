'use client';

import { SuccessToast } from './SuccessToast';
import { DraftDeleteDialog } from './writing-desk/DraftDeleteDialog';
import { useWritingDesk } from './writing-desk/useWritingDesk';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionReady: boolean;
};

function formatUpdated(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return 'recently';
  }
}

export function WritingDeskPanel({ open, onClose, sessionReady }: Props) {
  const {
    drafts,
    loading,
    error,
    editing,
    isCreating,
    editorTitle,
    setEditorTitle,
    editorBody,
    setEditorBody,
    editorTone,
    setEditorTone,
    selectedId,
    versionCount,
    saving,
    deleting,
    deleteTarget,
    setDeleteTarget,
    savedFlash,
    deletedFlash,
    copiedFlash,
    clearSavedFlash,
    clearDeletedFlash,
    clearCopiedFlash,
    startCreate,
    openDraft,
    backToList,
    saveDraft,
    confirmDelete,
    copyBody,
  } = useWritingDesk(open, sessionReady);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="writing-desk-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[1px]"
        aria-label="Close writing desk"
        onClick={onClose}
      />

      {savedFlash ? (
        <SuccessToast message="Draft saved." onDismiss={clearSavedFlash} />
      ) : null}
      {deletedFlash ? (
        <SuccessToast
          message="Draft deleted."
          onDismiss={clearDeletedFlash}
        />
      ) : null}
      {copiedFlash ? (
        <SuccessToast message="Copied." onDismiss={clearCopiedFlash} />
      ) : null}

      {deleteTarget ? (
        <DraftDeleteDialog
          title={deleteTarget.title}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-border-subtle bg-surface shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="min-w-0">
            <h2
              id="writing-desk-title"
              className="text-sm font-semibold text-ink"
            >
              Writing desk
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Drafts you can reopen and polish
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
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

          {editing ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={backToList}
                  className="text-xs font-medium text-ink-muted transition hover:text-ink"
                >
                  ← All drafts
                </button>
                {versionCount > 0 ? (
                  <p className="text-[11px] text-ink-muted">
                    {versionCount} prior version
                    {versionCount === 1 ? '' : 's'} kept
                  </p>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Title
                </span>
                <input
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder={
                    isCreating ? 'Cover letter, LinkedIn post…' : 'Title'
                  }
                  className="w-full rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Tone (optional)
                </span>
                <input
                  value={editorTone}
                  onChange={(e) => setEditorTone(e.target.value)}
                  placeholder="warm, concise, formal…"
                  className="w-full rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Draft
                </span>
                <textarea
                  value={editorBody}
                  onChange={(e) => setEditorBody(e.target.value)}
                  rows={16}
                  placeholder="Write here…"
                  className="w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-accent"
                />
              </label>

              <div className="flex flex-wrap gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={saving}
                  className="rounded-[var(--radius-md)] bg-accent px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => void copyBody()}
                  className="rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3.5 py-2 text-xs font-medium text-ink transition hover:border-accent/40"
                >
                  Copy
                </button>
                {!isCreating && selectedId !== null ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        id: selectedId,
                        title: editorTitle.trim() || 'Untitled draft',
                        tone: editorTone.trim() || null,
                        preview: '',
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="rounded-[var(--radius-md)] border border-danger/30 px-3.5 py-2 text-xs font-medium text-danger transition hover:bg-danger-soft"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!editing && loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            </div>
          ) : null}

          {!editing && !loading ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={startCreate}
                className="w-full rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft/50 px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
              >
                + New draft
              </button>

              {drafts.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">
                  Nothing here yet. Start a draft, or ask Laura to write
                  something and say “save this to my writing desk.”
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {drafts.map((draft) => (
                    <li key={draft.id}>
                      <button
                        type="button"
                        onClick={() => void openDraft(draft.id)}
                        className="w-full rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-accent-soft/30"
                      >
                        <span className="block text-sm font-medium text-ink">
                          {draft.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {draft.tone ? `${draft.tone} · ` : ''}
                          {formatUpdated(draft.updatedAt)}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-snug text-ink-muted">
                          {draft.preview}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
