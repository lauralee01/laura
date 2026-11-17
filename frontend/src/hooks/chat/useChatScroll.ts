'use client';

import { useCallback, useEffect, useRef } from 'react';

type Options = {
  messagesLength: number;
  loading: boolean;
  initializing: boolean;
  streaming: boolean;
};

/**
 * Stick-to-bottom scroll for the transcript. Auto-scroll only while the user
 * is already near the bottom so reading older messages is not yanked down.
 */
export function useChatScroll({
  messagesLength,
  loading,
  initializing,
  streaming,
}: Options) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const updateStickToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 120;
  }, []);

  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current && !initializing) {
      return;
    }

    bottomRef.current?.scrollIntoView({
      behavior: initializing || streaming ? 'auto' : 'smooth',
    });
  }, [messagesLength, loading, initializing, streaming]);

  return {
    bottomRef,
    scrollContainerRef,
    updateStickToBottom,
    pinToBottom,
  };
}
