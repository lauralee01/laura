'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchChatHistory,
  fetchConversations,
  renameConversation as renameConversationApi,
  sendChatMessage,
  sendChatMessageStream,
  type ConversationSummary,
} from '@/lib/chat-api';
import {
  ensureSession,
  type StoredChatMessage,
  syncBrowserTimeZone,
} from '@/lib/session';

function shouldRefreshGoogleStatus(reply: string): boolean {
  const normalizedReply = reply.toLowerCase();

  return (
    normalizedReply.includes('connect google again') ||
    normalizedReply.includes(
      'google session could not be renewed',
    ) ||
    normalizedReply.includes(
      'google connection expired',
    ) ||
    normalizedReply.includes(
      'google is not connected',
    )
  );
}

export function useChat() {
  const [sessionReady, setSessionReady] = useState(false);
  const [conversationId, setConversationId] =
    useState<string>();
  const [conversations, setConversations] = useState<
    ConversationSummary[]
  >([]);
  const [messages, setMessages] = useState<
    StoredChatMessage[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [creatingConversation, setCreatingConversation] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  /*
   * Only the newest open-thread request is allowed to update state.
   */
  const openThreadRequestIdRef = useRef(0);

  const reloadSidebar = useCallback(async () => {
    try {
      const conversationList =
        await fetchConversations();

      setConversations(conversationList);
    } catch (error: unknown) {
      console.warn(
        '[chat-sidebar] Failed to refresh conversations:',
        error,
      );
    }
  }, []);

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

        /*
         * The timezone sync and initial chat-data requests can run
         * concurrently after the session has been established.
         */
        const [
          ,
          conversationsResult,
          historyResult,
        ] = await Promise.allSettled([
          syncBrowserTimeZone(),
          fetchConversations(),
          fetchChatHistory(),
        ]);

        if (cancelled) {
          return;
        }

        /*
         * The session itself is ready even if one optional data
         * request failed.
         */
        setSessionReady(true);

        if (
          conversationsResult.status === 'fulfilled'
        ) {
          setConversations(
            conversationsResult.value,
          );
        }

        if (historyResult.status === 'fulfilled') {
          setMessages(historyResult.value.messages);
          setConversationId(
            historyResult.value.conversationId,
          );
        }

        if (
          conversationsResult.status === 'rejected' ||
          historyResult.status === 'rejected'
        ) {
          setError(
            'Some chat data could not be loaded.',
          );
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
        setError(
          'Could not load data. Is the API running?',
        );
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void initializeChat();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: initializing || streaming ? 'auto' : 'smooth',
    });
  }, [messages, loading, initializing, streaming]);

  useEffect(() => {
    function handleEscapeKey(
      event: KeyboardEvent,
    ): void {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleEscapeKey,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleEscapeKey,
      );
    };
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      if (!sessionReady) {
        return;
      }

      const requestId =
        ++openThreadRequestIdRef.current;

      setInitializing(true);
      setError(null);
      setConversationId(id);

      try {
        const history = await fetchChatHistory(id);

        if (
          requestId !==
          openThreadRequestIdRef.current
        ) {
          return;
        }

        setMessages(history.messages);
        setConversationId(
          history.conversationId ?? id,
        );
      } catch (threadError: unknown) {
        if (
          requestId !==
          openThreadRequestIdRef.current
        ) {
          return;
        }

        console.error(
          '[chat-thread] Failed to load conversation:',
          threadError,
        );

        setError('Could not load this chat.');
      } finally {
        if (
          requestId ===
          openThreadRequestIdRef.current
        ) {
          setInitializing(false);
        }
      }
    },
    [sessionReady],
  );

  const handleNewChat = useCallback(async () => {
    if (
      !sessionReady ||
      loading ||
      creatingConversation
    ) {
      return;
    }

    setCreatingConversation(true);
    setError(null);
    setSidebarOpen(false);

    try {
      const newConversationId =
        await createConversation();

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
    creatingConversation,
    loading,
    reloadSidebar,
    sessionReady,
  ]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const submittedText = input.trim();

      if (
        !submittedText ||
        loading ||
        !sessionReady
      ) {
        return;
      }

      setError(null);
      setInput('');
      setLoading(true);
      setStreaming(false);

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          role: 'user',
          content: submittedText,
        },
        {
          role: 'assistant',
          content: '',
        },
      ]);

      let accumulatedReply = '';

      try {
        const { conversationId: returnedConversationId } =
          await sendChatMessageStream(
            {
              conversationId,
              message: submittedText,
            },
            (chunk: string) => {
              setLoading(false);
              setStreaming(true);

              accumulatedReply += chunk;

              setMessages((prev) => {
                if (prev.length === 0) {
                  return prev;
                }

                const next = [...prev];
                const lastIndex = next.length - 1;
                const lastMessage = next[lastIndex];

                if (lastMessage?.role === 'assistant') {
                  next[lastIndex] = {
                    ...lastMessage,
                    content: accumulatedReply,
                  };
                }

                return next;
              });
            },
          );
        setStreaming(false);

        const activeConversationId =
          returnedConversationId ?? conversationId;

        if (activeConversationId) {
          setConversationId(activeConversationId);
        }

        if (shouldRefreshGoogleStatus(accumulatedReply)) {
          window.dispatchEvent(
            new Event(
              'google-connection-changed',
            ),
          );
        }

        void reloadSidebar();
      } catch (sendError: unknown) {
        const errorMessage =
          sendError instanceof Error
            ? sendError.message
            : 'Something went wrong.';

        setError(errorMessage);

        setMessages((previousMessages) =>
          previousMessages.slice(0, -2),
        );

        setInput(submittedText);
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [
      conversationId,
      input,
      loading,
      reloadSidebar,
      sessionReady,
    ],
  );

  const selectConversation = useCallback(
    (id: string) => {
      setSidebarOpen(false);
      void openThread(id);
    },
    [openThread],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (!sessionReady) {
        return;
      }

      const normalizedTitle = title.trim();

      if (!normalizedTitle) {
        setError(
          'The conversation title cannot be empty.',
        );
        return;
      }

      setError(null);

      try {
        await renameConversationApi(
          id,
          normalizedTitle,
        );

        void reloadSidebar();
      } catch (renameError: unknown) {
        setError(
          renameError instanceof Error
            ? renameError.message
            : 'Could not rename chat.',
        );
      }
    },
    [reloadSidebar, sessionReady],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!sessionReady) {
        return;
      }

      setError(null);

      try {
        await deleteConversationApi(id);

        const updatedConversationList =
          await fetchConversations();

        setConversations(
          updatedConversationList,
        );

        if (conversationId !== id) {
          return;
        }

        if (
          updatedConversationList.length === 0
        ) {
          openThreadRequestIdRef.current += 1;

          setConversationId(undefined);
          setMessages([]);
          return;
        }

        await openThread(
          updatedConversationList[0].id,
        );
      } catch (deleteError: unknown) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Could not delete chat.',
        );
      }
    },
    [
      conversationId,
      openThread,
      sessionReady,
    ],
  );

  return {
    sessionReady,
    conversationId,
    conversations,
    messages,
    input,
    setInput,
    loading,
    streaming,
    initializing,
    error,
    sidebarOpen,
    setSidebarOpen,
    bottomRef,
    showThinking: loading,
    handleSubmit,
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
  };
}