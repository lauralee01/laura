import type { MemoryItem } from '@/lib/memory-api';
import { formatMemoryDate } from './format-memory-date';

type Props = {
  item: MemoryItem;
  isEditing: boolean;
  editDraft: string;
  saving: boolean;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRequestDelete: () => void;
};

export function MemoryListItem({
  item,
  isEditing,
  editDraft,
  saving,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
}: Props) {
  return (
    <li className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated/80 px-3 py-2.5">
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/50"
            disabled={saving}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-canvas-mid disabled:opacity-50"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-[var(--radius-md)] bg-accent px-2.5 py-1.5 text-xs font-medium text-surface-elevated transition hover:bg-accent-hover disabled:opacity-50"
              onClick={onSaveEdit}
            >
              {saving ? 'Saving…' : 'Save'}
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
                className="cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
                onClick={onStartEdit}
              >
                Edit
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium text-danger transition hover:bg-danger-soft"
                onClick={onRequestDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
