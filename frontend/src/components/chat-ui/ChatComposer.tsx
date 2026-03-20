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
      className="shrink-0 bg-zinc-50/95 px-3 py-3 dark:border-zinc-800/80 dark:bg-zinc-950/95 md:px-6"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white/90 px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <textarea
          ref={textareaRef}
          rows={1}
          className="max-h-48 min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-xl bg-transparent py-2 pl-1 text-base leading-relaxed text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          placeholder="Message laura…"
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
          className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          aria-label="Send message"
        >
          <IconSend />
        </button>
      </div>
    </form>
  );
}
