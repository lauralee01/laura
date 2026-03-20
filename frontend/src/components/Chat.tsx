'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  createConversation,
  fetchChatHistory,
  fetchConversations,
  sendChatMessage,
  type ConversationSummary,
} from '@/lib/chat-api';
import { getOrCreateSessionId, type StoredChatMessage } from '@/lib/session';
import { BrandLockup } from '@/components/BrandLockup';

function formatChatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function SidebarContent(props: {
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  disabled: boolean;
}) {
  const { conversations, activeId, onSelect, onNewChat, disabled } = props;

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
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? 'bg-zinc-200/90 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="line-clamp-2 font-medium leading-snug">
                    {c.preview}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
                    {formatChatDate(c.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function Chat() {
  const [sessionId, setSessionId] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    []
  );
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  /** Max height before the composer scrolls (~max-h-48). */
  const COMPOSER_MAX_HEIGHT_PX = 192;

  const adjustComposerHeight = useCallback(() => {
    const el = composerRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY =
      el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustComposerHeight();
  }, [input, adjustComposerHeight]);

  const reloadSidebar = useCallback(async (sid: string) => {
    try {
      const list = await fetchConversations(sid);
      setConversations(list);
    } catch {
      /* keep existing list */
    }
  }, []);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);
    setMessages([]);
    setInitializing(true);
    setError(null);

    Promise.all([fetchConversations(sid), fetchChatHistory(sid)])
      .then(([convs, hist]) => {
        setConversations(convs);
        setMessages(hist.messages);
        setConversationId(hist.conversationId);
      })
      .catch(() => {
        setMessages([]);
        setError('Could not load data. Is the API running?');
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, initializing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      if (!sessionId) {
        return;
      }
      setInitializing(true);
      setError(null);
      setConversationId(id);
      try {
        const hist = await fetchChatHistory(sessionId, id);
        setMessages(hist.messages);
        setConversationId(hist.conversationId ?? id);
      } catch {
        setError('Could not load this chat.');
      } finally {
        setInitializing(false);
      }
    },
    [sessionId]
  );

  const handleNewChat = useCallback(async () => {
    if (!sessionId || loading) {
      return;
    }
    setError(null);
    setSidebarOpen(false);
    try {
      const id = await createConversation(sessionId);
      setConversationId(id);
      setMessages([]);
      await reloadSidebar(sessionId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not start a new chat.'
      );
    }
  }, [loading, reloadSidebar, sessionId]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || loading || !sessionId) {
        return;
      }

      setError(null);
      setInput('');

      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setLoading(true);

      try {
        const { reply, conversationId: idFromSend } = await sendChatMessage({
          sessionId,
          conversationId,
          message: text,
        });
        setConversationId(idFromSend ?? conversationId);
        try {
          const refreshed = await fetchChatHistory(
            sessionId,
            idFromSend ?? conversationId
          );
          setMessages(refreshed.messages);
          setConversationId(
            refreshed.conversationId ?? idFromSend ?? conversationId
          );
        } catch {
          setError(
            'Message was saved, but the thread could not be refreshed. Try reloading the page.'
          );
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: reply },
          ]);
        }
        await reloadSidebar(sessionId);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Something went wrong.';
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, input, loading, reloadSidebar, sessionId]
  );

  const showThinking = useMemo(
    () => loading || initializing,
    [initializing, loading]
  );

  const sidebarProps = {
    conversations,
    activeId: conversationId,
    onSelect: (id: string) => {
      void openThread(id);
      setSidebarOpen(false);
    },
    onNewChat: () => {
      void handleNewChat();
    },
    disabled: loading || !sessionId,
  };

  return (
    <div className="flex h-[100dvh] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-[min(100%,18rem)] shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-100/90 dark:border-zinc-800/80 dark:bg-zinc-950 md:flex">
        <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800/80">
          <BrandLockup size="md" />
        </div>
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Chat history"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(100%,18rem)] flex-col border-r border-zinc-200/80 bg-zinc-100 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800/80">
              <BrandLockup size="md" />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SidebarContent {...sidebarProps} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800/80 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Open chat history"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <BrandLockup size="sm" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
          {messages.length === 0 && !showThinking && (
            <p className="mx-auto max-w-2xl py-12 text-center text-base text-zinc-500 dark:text-zinc-400">
              Hi, I&apos;m laura. How can I help you today?
            </p>
          )}

          <ul className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((m, i) => (
              <li
                key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[min(100%,42rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border border-zinc-200/90 bg-white/90 text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-100'
                  }`}
                >
                  {m.content}
                </div>
              </li>
            ))}
            {showThinking && (
              <li className="flex justify-start">
                <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-2.5 text-sm text-zinc-500 italic dark:border-zinc-800 dark:bg-zinc-900/80">
                  laura is thinking…
                </div>
              </li>
            )}
          </ul>
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="shrink-0 border-t border-red-200/90 bg-red-50/90 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="shrink-0 bg-zinc-50/95 px-3 py-3 dark:border-zinc-800/80 dark:bg-zinc-950/95 md:px-6"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white/90 px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <textarea
              ref={composerRef}
              rows={1}
              className="max-h-48 min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-xl bg-transparent py-2 pl-1 text-base leading-relaxed text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              placeholder="Message laura…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={loading || !sessionId}
              autoComplete="off"
              aria-label="Message"
            />
            <button
              type="submit"
              disabled={loading || !sessionId || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              aria-label="Send message"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
