import { memo, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ActionReceiptStrip } from '@/components/chat-ui/ActionReceiptStrip';
import { ConfirmChipStrip } from '@/components/chat-ui/ConfirmChipStrip';
import { ChatEmptyState } from '@/components/chat-ui/ChatEmptyState';
import type { StoredChatMessage } from '@/lib/session';

type Props = {
  messages: StoredChatMessage[];
  showThinking: boolean;
  streaming: boolean;
  initializing: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  onSuggestion?: (prompt: string) => void;
  onSendSuggestion?: (prompt: string) => void;
  suggestionsDisabled?: boolean;
  chipsDisabled?: boolean;
  onConfirmChip?: (text: string) => void;
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
      className="break-words text-accent underline underline-offset-2 transition hover:text-accent-hover"
    >
      {children}
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-ink">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-ink">{children}</ol>
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
  onSuggestion,
  onSendSuggestion,
  suggestionsDisabled,
  chipsDisabled,
  onConfirmChip,
}: Props) {
  const empty = messages.length === 0 && !showThinking && !initializing;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-6"
    >
      {empty && onSuggestion && (
        <ChatEmptyState
          onSuggestion={onSuggestion}
          onSendSuggestion={onSendSuggestion}
          disabled={suggestionsDisabled}
        />
      )}
      {empty && !onSuggestion && (
        <p className="mx-auto max-w-2xl py-12 text-center text-base text-ink-muted">
          Hi, I&apos;m laura. What can I take care of today?
        </p>
      )}

      {initializing && messages.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
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
              className={`laura-message-enter flex min-w-0 ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div className="flex min-w-0 max-w-[85%] flex-col">
                <div
                  className={`min-w-0 overflow-hidden rounded-[var(--radius-lg)] px-4 py-2.5 text-sm leading-relaxed break-words ${
                    m.role === 'user'
                      ? 'bg-accent-soft text-ink'
                      : 'bg-surface-elevated/90 text-ink shadow-soft'
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
                          className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] rounded-sm bg-accent animate-pulse"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">
                      {m.content}
                    </span>
                  )}
                </div>
                {m.role === 'assistant' && m.receipt && !isStreamingAssistant ? (
                  <ActionReceiptStrip receipt={m.receipt} />
                ) : null}
                {m.role === 'assistant' &&
                m.confirmPrompt &&
                !isStreamingAssistant &&
                onConfirmChip ? (
                  <ConfirmChipStrip
                    prompt={m.confirmPrompt}
                    disabled={chipsDisabled}
                    onConfirm={onConfirmChip}
                    onCancel={onConfirmChip}
                  />
                ) : null}
              </div>
            </li>
          );
        })}

        {showThinking && (
          <li className="laura-message-enter flex justify-start">
            <div className="flex max-w-[85%] items-center gap-2 overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-elevated/90 px-4 py-3 text-sm text-ink-muted shadow-soft">
              <span className="flex gap-1" aria-hidden="true">
                <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
                <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
                <span className="laura-think-dot h-1.5 w-1.5 rounded-full bg-accent/80" />
              </span>
              <span>laura is thinking…</span>
            </div>
          </li>
        )}
      </ul>

      <div ref={bottomRef} />
    </div>
  );
});
