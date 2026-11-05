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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  /*
   * Only auto-scroll while the user is already near the bottom so reading
   * older messages is not yanked down by stream chunks.
   */
  const stickToBottomRef = useRef(true);

  /*
   * Only the newest open-thread request is allowed to update state.
   */
  const openThreadRequestIdRef = useRef(0);

  /*
   * Stream generation guard: ignore chunks / completion from a stale send,
   * and abort the in-flight fetch when switching chats or starting a new one.
   */
  const streamGenerationRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<StoredChatMessage[]>([]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const updateStickToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 120;
  }, []);

  const abortActiveStream = useCallback(() => {
    streamGenerationRef.current += 1;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setLoading(false);
    setStreaming(false);
  }, []);

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
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current && !initializing) {
      return;
    }

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
      if (!sessionReady || loading || streaming) {
        return;
      }

      const previousConversationId = conversationIdRef.current;
      const previousMessages = messagesRef.current;
      const requestId =
        ++openThreadRequestIdRef.current;

      setInitializing(true);
      setError(null);
      stickToBottomRef.current = true;

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

        /*
         * Keep the prior transcript selected — never leave "B highlighted
         * with A's messages" after a failed load.
         */
        setConversationId(previousConversationId);
        setMessages(previousMessages);
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
    [loading, sessionReady, streaming],
  );

  const handleNewChat = useCallback(async () => {
    if (
      !sessionReady ||
      loading ||
      streaming ||
      creatingConversation
    ) {
      return;
    }

    abortActiveStream();
    setCreatingConversation(true);
    setError(null);
    setSidebarOpen(false);
    stickToBottomRef.current = true;

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
    abortActiveStream,
    creatingConversation,
    loading,
    reloadSidebar,
    sessionReady,
    streaming,
  ]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const submittedText = input.trim();

      if (
        !submittedText ||
        loading ||
        streaming ||
        !sessionReady
      ) {
        return;
      }

      const generationId = ++streamGenerationRef.current;
      const abortController = new AbortController();
      streamAbortRef.current?.abort();
      streamAbortRef.current = abortController;

      const submitConversationId = conversationId;
      const priorHistory = messages.slice(-40);

      setError(null);
      setInput('');
      setLoading(true);
      setStreaming(false);
      stickToBottomRef.current = true;

      /*
       * Optimistic user turn only. The empty assistant bubble used to
       * appear beside "laura is thinking…" — append assistant on first chunk.
       */
      setMessages((previousMessages) => [
        ...previousMessages,
        {
          role: 'user',
          content: submittedText,
        },
      ]);

      let accumulatedReply = '';
      let assistantStarted = false;

      try {
        const { conversationId: returnedConversationId } =
          await sendChatMessageStream(
            {
              conversationId: submitConversationId,
              message: submittedText,
              history: priorHistory,
            },
            (chunk: string) => {
              if (generationId !== streamGenerationRef.current) {
                return;
              }

              if (!assistantStarted) {
                assistantStarted = true;
                setLoading(false);
                setStreaming(true);
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: chunk,
                  },
                ]);
                accumulatedReply = chunk;
                return;
              }

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
            abortController.signal,
          );

        if (generationId !== streamGenerationRef.current) {
          return;
        }

        setStreaming(false);

        const activeConversationId =
          returnedConversationId ?? submitConversationId;

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
        if (
          generationId !== streamGenerationRef.current ||
          isAbortError(sendError)
        ) {
          return;
        }

        const errorMessage =
          sendError instanceof Error
            ? sendError.message
            : 'Something went wrong.';

        setError(errorMessage);

        /*
         * Only roll back if we are still on the conversation that sent
         * this message — otherwise a mid-stream switch would delete turns
         * from the newly opened thread.
         */
        if (conversationIdRef.current === submitConversationId) {
          setMessages((previousMessages) => {
            if (assistantStarted) {
              return previousMessages.slice(0, -2);
            }
            return previousMessages.slice(0, -1);
          });
          setInput(submittedText);
        }
      } finally {
        if (generationId === streamGenerationRef.current) {
          setLoading(false);
          setStreaming(false);
          if (streamAbortRef.current === abortController) {
            streamAbortRef.current = null;
          }
        }
      }
    },
    [
      conversationId,
      input,
      loading,
      messages,
      reloadSidebar,
      sessionReady,
      streaming,
    ],
  );

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
      if (!sessionReady || loading || streaming) {
        return;
      }

      setError(null);

      try {
        if (conversationId === id) {
          abortActiveStream();
        }

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
      abortActiveStream,
      conversationId,
      loading,
      openThread,
      sessionReady,
      streaming,
    ],
  );

  const isBusy =
    loading || streaming || creatingConversation || initializing;

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
    creatingConversation,
    isBusy,
    /** True while a reply is in flight (thinking or streaming tokens). */
    isGenerating: loading || streaming,
    error,
    setError,
    sidebarOpen,
    setSidebarOpen,
    bottomRef,
    scrollContainerRef,
    updateStickToBottom,
    showThinking: loading && !streaming,
    handleSubmit,
    stopStreaming: abortActiveStream,
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
  };
}
