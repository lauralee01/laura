import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StoredChatMessage } from '@/lib/session';

type Props = {
  messages: StoredChatMessage[];
  showThinking: boolean;
  initializing: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
};

function MessageMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline underline-offset-2 hover:text-blue-400 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {children}
          </a>
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatMessageList({
  messages,
  showThinking,
  bottomRef,
  initializing,
}: Props) {
  const empty = messages.length === 0 && !showThinking && !initializing;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
      {empty && (
        <p className="mx-auto max-w-2xl py-12 text-center text-base text-zinc-500 dark:text-zinc-400">
          Hi, I&apos;m laura. How can I help you today?
        </p>
      )}

      {initializing && messages.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600/20 border-t-zinc-600 dark:border-zinc-500/20 dark:border-t-zinc-300" />
        </div>
      )}

      <ul className="mx-auto flex max-w-2xl flex-col gap-3">
        {messages.map((m, i) => (
          <li
            key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
          >
            <div
              className={`max-w-[min(100%,42rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user'
                  ? 'bg-zinc-200/90 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-800 shadow-sm dark:text-zinc-100'
                }`}
            >
              {m.role === 'assistant' ? (
                <MessageMarkdown content={m.content} />
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
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