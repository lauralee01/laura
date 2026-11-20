'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconCopy } from '@/components/chat-ui/ChatIcons';

type Props = {
  content: string;
  align?: 'start' | 'end';
};

export function MessageCopyButton({ content, align = 'start' }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const onCopy = useCallback(async () => {
    const text = content.trim();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [content]);

  return (
    <div
      className={`mt-1 flex ${align === 'end' ? 'justify-end' : 'justify-start'}`}
    >
      <button
        type="button"
        onClick={() => void onCopy()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-ink-muted opacity-0 transition hover:bg-canvas-mid/80 hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        {copied ? (
          <IconCheck className="h-3.5 w-3.5 text-accent" />
        ) : (
          <IconCopy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
