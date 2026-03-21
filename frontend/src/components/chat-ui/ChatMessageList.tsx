import type { RefObject } from 'react';
import type { StoredChatMessage } from '@/lib/session';

type Props = {
  messages: StoredChatMessage[];
  showThinking: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessageList({
  messages,
  showThinking,
  bottomRef,
}: Props) {
  const empty = messages.length === 0 && !showThinking;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
      {empty && (
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
                  ? 'bg-zinc-200/90 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-100'
                  : ' text-zinc-800 shadow-sm dark:text-zinc-100'
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
  );
}
