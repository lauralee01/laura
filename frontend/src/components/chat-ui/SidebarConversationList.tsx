'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatChatDate } from '@/lib/format-chat-date';
import type { ConversationSummary } from '@/lib/chat-api';
import { IconDotsHorizontal, IconPlus } from '@/components/chat-ui/ChatIcons';

type Props = {
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  disabled: boolean;
};

export function SidebarConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  disabled,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    preview: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuId) {
      return;
    }
    const close = (e: MouseEvent) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        setMenuId(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuId(null);
        setRenameTarget(null);
        setDeleteConfirm(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameTarget) {
      return;
    }
    const t = renameTarget.value.trim();
    await Promise.resolve(onRename(renameTarget.id, t));
    setRenameTarget(null);
  }, [onRename, renameTarget]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) {
      return;
    }
    setDeleting(true);
    try {
      await Promise.resolve(onDelete(deleteConfirm.id));
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, onDelete]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">
          Chats
        </span>
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-2.5 py-1.5 text-xs font-medium text-surface-elevated transition hover:bg-accent-hover disabled:opacity-40"
          aria-label="New chat"
        >
          <IconPlus className="h-3.5 w-3.5" />
          New
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-ink-muted">
            No chats yet. Send a message or tap New to start one.
          </p>
        ) : null}
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id} className="relative">
                <div
                  className={`flex items-stretch gap-0.5 rounded-[var(--radius-md)] transition ${
                    active
                      ? 'bg-accent-soft'
                      : 'hover:bg-canvas-mid/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    disabled={disabled}
                    className={`min-w-0 flex-1 flex-col gap-0.5 rounded-l-[var(--radius-md)] px-3 py-2.5 text-left text-sm disabled:opacity-40 ${
                      active ? 'text-ink' : 'text-ink-muted'
                    }`}
                  >
                    <span className="line-clamp-2 font-medium leading-snug text-ink">
                      {c.preview}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {formatChatDate(c.updatedAt)}
                    </span>
                  </button>
                  <div
                    className="relative shrink-0"
                    ref={menuId === c.id ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId((prev) => (prev === c.id ? null : c.id));
                      }}
                      className="flex h-full items-center rounded-r-[var(--radius-md)] px-2 text-ink-muted transition hover:bg-canvas-deep/50 hover:text-ink disabled:opacity-40"
                      aria-label={`Chat options: ${c.preview}`}
                      aria-expanded={menuId === c.id}
                    >
                      <IconDotsHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === c.id && (
                      <ul
                        className="absolute right-0 top-full z-[60] mt-0.5 min-w-[10rem] rounded-[var(--radius-md)] border border-border bg-surface-elevated py-1 text-sm shadow-soft"
                        role="menu"
                      >
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full px-3 py-2 text-left text-ink transition hover:bg-canvas-mid"
                            onClick={() => {
                              setMenuId(null);
                              setRenameTarget({
                                id: c.id,
                                value: c.preview,
                              });
                            }}
                          >
                            Rename
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full px-3 py-2 text-left text-danger transition hover:bg-danger-soft"
                            onClick={() => {
                              setMenuId(null);
                              setDeleteConfirm({
                                id: c.id,
                                preview: c.preview,
                              });
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {renameTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-chat-title"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="rename-chat-title"
              className="text-sm font-semibold text-ink"
            >
              Rename chat
            </h2>
            <input
              type="text"
              value={renameTarget.value}
              onChange={(e) =>
                setRenameTarget((prev) =>
                  prev ? { ...prev, value: e.target.value } : prev,
                )
              }
              className="mt-3 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              maxLength={200}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitRename();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-sm font-medium text-surface-elevated transition hover:bg-accent-hover"
                onClick={() => void submitRename()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[1px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-chat-title"
          aria-describedby="delete-chat-desc"
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-chat-title"
              className="text-base font-semibold text-ink"
            >
              Delete chat?
            </h2>
            <p
              id="delete-chat-desc"
              className="mt-2 text-sm leading-relaxed text-ink-muted"
            >
              This removes{' '}
              <span className="font-medium text-ink">
                “{deleteConfirm.preview}”
              </span>{' '}
              and all messages in it. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm text-ink-muted transition hover:bg-canvas-mid disabled:opacity-50"
                onClick={() => setDeleteConfirm(null)}
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
      )}
    </>
  );
}
