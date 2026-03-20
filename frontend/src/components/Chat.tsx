'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { fetchChatHistory, sendChatMessage } from '@/lib/chat-api';
import {
  getOrCreateSessionId,
  rotateSessionId,
  type StoredChatMessage,
} from '@/lib/session';
import { LauraMark } from '@/components/LauraMark';


export function Chat() {
  const [sessionId, setSessionId] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Session id in localStorage; messages only from backend (Postgres).
  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);
    setMessages([]);
    setInitializing(true);
    setError(null);
    fetchChatHistory(sid)
      .then((data) => {
        setMessages(data.messages);
        setConversationId(data.conversationId);
      })
      .catch(() => {
        setMessages([]);
        setError('Could not load chat history. Is the API running?');
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleNewChat = useCallback(() => {
    const sid = rotateSessionId();
    setSessionId(sid);
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    setInput('');
  }, []);

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
          const refreshed = await fetchChatHistory(sessionId);
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
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Something went wrong.';
        setError(msg);
        // Remove the optimistic user message if the request failed completely
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, input, loading, sessionId]
  );

  const showThinking = useMemo(
    () => loading || initializing,
    [initializing, loading]
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <LauraMark className="h-7 w-7 shrink-0" />
          <h1 className="text-lg font-semibold tracking-tight">laura</h1>
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          New chat
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !showThinking && (
          <p className="mx-auto p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">
            Start a conversation
          </p>
        )}

        <ul className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((m, i) => (
            <li
              key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : ' text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
                }`}
              >
                {m.content}
              </div>
            </li>
          ))}
          {showThinking && (
            <li className="flex justify-start">
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500 italic dark:border-zinc-700 dark:bg-zinc-900">
                laura is thinking…
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900"
            placeholder="Talk to laura…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || !sessionId}
            autoComplete="off"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={loading || !sessionId || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            aria-label="Send message"
          >
            <svg
              className="h-5 w-5"
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
  );
}
