import { memo, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StoredChatMessage } from '@/lib/session';

type Props = {
  messages: StoredChatMessage[];
  showThinking: boolean;
  streaming: boolean;
  initializing: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
};

const markdownComponents = {
  a: ({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href?: string;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-blue-500 underline underline-offset-2 hover:text-blue-400 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="pl-1">{children}</li>
  ),
};

function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="min-w-0 overflow-hidden break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  showThinking,
  streaming,
  bottomRef,
  scrollContainerRef,
  onScroll,
  initializing,
}: Props) {
  const empty = messages.length === 0 && !showThinking && !initializing;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-6"
    >
      {empty && (
        <p className="mx-auto max-w-2xl py-12 text-center text-base text-zinc-500 dark:text-zinc-400">
          Hi, I&apos;m laura. What can I take care of today?
        </p>
      )}

      {initializing && messages.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600/20 border-t-zinc-600 dark:border-zinc-500/20 dark:border-t-zinc-300" />
        </div>
      )}

      <ul className="mx-auto flex w-full max-w-2xl flex-col gap-3 overflow-x-hidden">
        {messages.map((m, i) => {
          const isStreamingAssistant =
            streaming &&
            m.role === 'assistant' &&
            i === messages.length - 1;

          return (
            <li
              key={`${i}-${m.role}`}
              className={`flex min-w-0 ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`min-w-0 max-w-[85%] overflow-hidden rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                  m.role === 'user'
                    ? 'bg-zinc-200/90 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-800 shadow-sm dark:text-zinc-100'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div>
                    {/*
                     * Defer markdown parse until the stream finishes so each
                     * token does not rebuild the full remark AST.
                     */}
                    {isStreamingAssistant ? (
                      <span className="whitespace-pre-wrap break-words">
                        {m.content}
                      </span>
                    ) : (
                      <MessageMarkdown content={m.content} />
                    )}

                    {isStreamingAssistant && (
                      <span
                        className="ml-0.5 inline-block animate-pulse"
                        aria-hidden="true"
                      >
                        ▋
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap break-words">
                    {m.content}
                  </span>
                )}
              </div>
            </li>
          );
        })}

        {showThinking && (
          <li className="flex justify-start">
            <div className="max-w-[85%] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-2.5 text-sm text-zinc-500 italic break-words dark:border-zinc-800 dark:bg-zinc-900/80">
              laura is thinking…
            </div>
          </li>
        )}
      </ul>

      <div ref={bottomRef} />
    </div>
  );
});
