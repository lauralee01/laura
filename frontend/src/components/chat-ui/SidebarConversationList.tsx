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
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Chats
        </span>
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-200/80 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="New chat"
        >
          <IconPlus />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            No chats yet. Send a message or tap + to start one.
          </p>
        ) : null}
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id} className="relative">
                <div
                  className={`flex items-stretch gap-0.5 rounded-lg transition ${
                    active
                      ? 'bg-zinc-200/90 dark:bg-zinc-800'
                      : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    disabled={disabled}
                    className="min-w-0 flex-1 flex-col gap-0.5 rounded-l-lg px-3 py-2.5 text-left text-sm text-zinc-700 disabled:opacity-40 dark:text-zinc-300"
                  >
                    <span className="line-clamp-2 font-medium leading-snug">
                      {c.preview}
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      {formatChatDate(c.updatedAt)}
                    </span>
                  </button>
                  <div className="relative shrink-0" ref={menuId === c.id ? menuRef : undefined}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId((prev) => (prev === c.id ? null : c.id));
                      }}
                      className="flex h-full items-center rounded-r-lg px-2 text-zinc-500 transition hover:bg-zinc-300/50 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-100"
                      aria-label={`Chat options: ${c.preview}`}
                      aria-expanded={menuId === c.id}
                    >
                      <IconDotsHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === c.id && (
                      <ul
                        className="absolute right-0 top-full z-[60] mt-0.5 min-w-[10rem] rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                        role="menu"
                      >
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full px-3 py-2 text-left text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
                            className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            onClick={() => {
                              setMenuId(null);
                              setDeleteConfirm({ id: c.id, preview: c.preview });
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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-chat-title"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="rename-chat-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Rename chat
            </h2>
            <input
              type="text"
              value={renameTarget.value}
              onChange={(e) =>
                setRenameTarget((prev) =>
                  prev ? { ...prev, value: e.target.value } : prev
                )
              }
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-chat-title"
          aria-describedby="delete-chat-desc"
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-600 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-chat-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Delete chat?
            </h2>
            <p
              id="delete-chat-desc"
              className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
            >
              This removes{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                “{deleteConfirm.preview}”
              </span>{' '}
              and all messages in it. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
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
