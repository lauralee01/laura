'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
} from 'react';
import { IconSend } from '@/components/chat-ui/ChatIcons';

const MAX_HEIGHT_PX = 192; // matches max-h-48

type Props = {
  input: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  disabled: boolean;
};

export function ChatComposer({ input, onChange, onSubmit, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY =
      el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    syncHeight();
  }, [input, syncHeight]);

  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 bg-transparent px-3 py-3 md:px-6"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-3 py-2 shadow-soft">
        <textarea
          ref={textareaRef}
          rows={1}
          className="max-h-48 min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-[var(--radius-md)] bg-transparent py-2 pl-1 text-base leading-relaxed text-ink outline-none ring-0 placeholder:text-ink-muted"
          placeholder="Talk to laura…"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={disabled}
          autoComplete="off"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-[var(--radius-md)] bg-accent text-surface-elevated transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          <IconSend />
        </button>
      </div>
    </form>
  );
}
