'use client';

import { useEffect, useState } from 'react';
import {
  fetchChatHistory,
  fetchConversations,
  type ConversationSummary,
} from '@/lib/chat-api';
import {
  ensureSession,
  type StoredChatMessage,
  syncBrowserTimeZone,
} from '@/lib/session';

type Options = {
  setConversations: (value: ConversationSummary[]) => void;
  setMessages: (value: StoredChatMessage[]) => void;
  setConversationId: (value: string | undefined) => void;
  setError: (value: string | null) => void;
  onUnmountAbort?: () => void;
};

/**
 * One-shot session cookie + initial conversations/history load.
 */
export function useChatBootstrap({
  setConversations,
  setMessages,
  setConversationId,
  setError,
  onUnmountAbort,
}: Options) {
  const [sessionReady, setSessionReady] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initializeChat(): Promise<void> {
      setMessages([]);
      setInitializing(true);
      setError(null);
      setSessionReady(false);

      try {
        await ensureSession();

        if (cancelled) {
          return;
        }

        const [, conversationsResult, historyResult] =
          await Promise.allSettled([
            syncBrowserTimeZone(),
            fetchConversations(),
            fetchChatHistory(),
          ]);

        if (cancelled) {
          return;
        }

        setSessionReady(true);

        if (conversationsResult.status === 'fulfilled') {
          setConversations(conversationsResult.value);
        }

        if (historyResult.status === 'fulfilled') {
          setMessages(historyResult.value.messages);
          setConversationId(historyResult.value.conversationId);
        }

        if (
          conversationsResult.status === 'rejected' ||
          historyResult.status === 'rejected'
        ) {
          setError('Some chat data could not be loaded.');
        }
      } catch (initializationError: unknown) {
        if (cancelled) {
          return;
        }

        console.error(
          '[chat-initialization] Failed:',
          initializationError,
        );

        setMessages([]);
        setError('Could not load data. Is the API running?');
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void initializeChat();

    return () => {
      cancelled = true;
      onUnmountAbort?.();
    };
    // Mount-only bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sessionReady,
    initializing,
    setInitializing,
  };
}
