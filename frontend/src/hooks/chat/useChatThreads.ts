'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchChatHistory,
  fetchConversations,
  renameConversation as renameConversationApi,
  type ConversationSummary,
} from '@/lib/chat-api';
import { formatChatTranscript } from '@/lib/format-chat-transcript';
import type { StoredChatMessage } from '@/lib/session';

type Options = {
  sessionReady: boolean;
  conversationId: string | undefined;
  conversationIdRef: React.MutableRefObject<string | undefined>;
  messagesRef: React.MutableRefObject<StoredChatMessage[]>;
  loading: boolean;
  streaming: boolean;
  setConversationId: (value: string | undefined) => void;
  setMessages: React.Dispatch<React.SetStateAction<StoredChatMessage[]>>;
  setConversations: React.Dispatch<
    React.SetStateAction<ConversationSummary[]>
  >;
  setError: (value: string | null) => void;
  setInitializing: (value: boolean) => void;
  abortActiveStream: () => void;
  pinToBottom: () => void;
};

/**
 * Sidebar actions: open / new / rename / delete + drawer open state.
 * Conversation list state stays in the parent composer.
 */
export function useChatThreads({
  sessionReady,
  conversationId,
  conversationIdRef,
  messagesRef,
  loading,
  streaming,
  setConversationId,
  setMessages,
  setConversations,
  setError,
  setInitializing,
  abortActiveStream,
  pinToBottom,
}: Options) {
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openThreadRequestIdRef = useRef(0);

  const reloadSidebar = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch (error: unknown) {
      console.warn(
        '[chat-sidebar] Failed to refresh conversations:',
        error,
      );
    }
  }, [setConversations]);

  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }

    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      if (!sessionReady || loading || streaming) {
        return;
      }

      const previousConversationId = conversationIdRef.current;
      const previousMessages = messagesRef.current;
      const requestId = ++openThreadRequestIdRef.current;

      setInitializing(true);
      setError(null);
      pinToBottom();

      try {
        const history = await fetchChatHistory(id);

        if (requestId !== openThreadRequestIdRef.current) {
          return;
        }

        setMessages(history.messages);
        setConversationId(history.conversationId ?? id);
      } catch (threadError: unknown) {
        if (requestId !== openThreadRequestIdRef.current) {
          return;
        }

        console.error(
          '[chat-thread] Failed to load conversation:',
          threadError,
        );

        /*
         * Keep the prior transcript selected — never leave "B highlighted
         * with A's messages" after a failed load.
         */
        setConversationId(previousConversationId);
        setMessages(previousMessages);
        setError('Could not load this chat.');
      } finally {
        if (requestId === openThreadRequestIdRef.current) {
          setInitializing(false);
        }
      }
    },
    [
      conversationIdRef,
      loading,
      messagesRef,
      pinToBottom,
      sessionReady,
      setConversationId,
      setError,
      setInitializing,
      setMessages,
      streaming,
    ],
  );

  const handleNewChat = useCallback(async () => {
    if (!sessionReady || loading || streaming || creatingConversation) {
      return;
    }

    abortActiveStream();
    setCreatingConversation(true);
    setError(null);
    setSidebarOpen(false);
    pinToBottom();

    try {
      const newConversationId = await createConversation();

      /*
       * Invalidate any still-running thread request so it cannot
       * overwrite this newly created conversation.
       */
      openThreadRequestIdRef.current += 1;

      setConversationId(newConversationId);
      setMessages([]);

      void reloadSidebar();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not start a new chat.',
      );
    } finally {
      setCreatingConversation(false);
    }
  }, [
    abortActiveStream,
    creatingConversation,
    loading,
    pinToBottom,
    reloadSidebar,
    sessionReady,
    setConversationId,
    setError,
    setMessages,
    streaming,
  ]);

  const selectConversation = useCallback(
    (id: string) => {
      if (loading || streaming) {
        return;
      }
      setSidebarOpen(false);
      void openThread(id);
    },
    [loading, openThread, streaming],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (!sessionReady) {
        return;
      }

      const normalizedTitle = title.trim();

      if (!normalizedTitle) {
        setError('The conversation title cannot be empty.');
        return;
      }

      setError(null);

      try {
        await renameConversationApi(id, normalizedTitle);
        void reloadSidebar();
      } catch (renameError: unknown) {
        setError(
          renameError instanceof Error
            ? renameError.message
            : 'Could not rename chat.',
        );
      }
    },
    [reloadSidebar, sessionReady, setError],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!sessionReady || loading || streaming) {
        return;
      }

      setError(null);

      try {
        if (conversationId === id) {
          abortActiveStream();
        }

        await deleteConversationApi(id);

        const updatedConversationList = await fetchConversations();
        setConversations(updatedConversationList);

        if (conversationId !== id) {
          return;
        }

        if (updatedConversationList.length === 0) {
          openThreadRequestIdRef.current += 1;
          setConversationId(undefined);
          setMessages([]);
          return;
        }

        await openThread(updatedConversationList[0].id);
      } catch (deleteError: unknown) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Could not delete chat.',
        );
      }
    },
    [
      abortActiveStream,
      conversationId,
      loading,
      openThread,
      sessionReady,
      setConversationId,
      setConversations,
      setError,
      setMessages,
      streaming,
    ],
  );

  const copyConversation = useCallback(
    async (id: string): Promise<boolean> => {
      if (!sessionReady) {
        return false;
      }

      setError(null);

      try {
        const messages =
          conversationId === id && messagesRef.current.length > 0
            ? messagesRef.current
            : (await fetchChatHistory(id)).messages;

        const transcript = formatChatTranscript(messages);
        if (!transcript) {
          setError('Nothing to copy yet.');
          return false;
        }

        await navigator.clipboard.writeText(transcript);
        return true;
      } catch (copyError: unknown) {
        setError(
          copyError instanceof Error
            ? copyError.message
            : 'Could not copy chat.',
        );
        return false;
      }
    },
    [conversationId, messagesRef, sessionReady, setError],
  );

  return {
    creatingConversation,
    sidebarOpen,
    setSidebarOpen,
    reloadSidebar,
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
    copyConversation,
  };
}
