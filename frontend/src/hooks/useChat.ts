'use client';

import {
  useCallback,
  useEffect,
  useMemo,
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
  type ConversationSummary,
} from '@/lib/chat-api';
import { ensureSession, type StoredChatMessage } from '@/lib/session';

export function useChat() {
  const [sessionReady, setSessionReady] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    []
  );
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const reloadSidebar = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
    } catch {
      /* keep existing list */
    }
  }, []);

  useEffect(() => {
    setMessages([]);
    setInitializing(true);
    setError(null);
    setSessionReady(false);

    ensureSession()
      .then(() => {
        setSessionReady(true);
        return Promise.all([fetchConversations(), fetchChatHistory()]);
      })
      .then(([convs, hist]) => {
        setConversations(convs);
        setMessages(hist.messages);
        setConversationId(hist.conversationId);
      })
      .catch(() => {
        setMessages([]);
        setError('Could not load data. Is the API running?');
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, initializing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      if (!sessionReady) {
        return;
      }
      setInitializing(true);
      setError(null);
      setConversationId(id);
      try {
        const hist = await fetchChatHistory(id);
        setMessages(hist.messages);
        setConversationId(hist.conversationId ?? id);
      } catch {
        setError('Could not load this chat.');
      } finally {
        setInitializing(false);
      }
    },
    [sessionReady]
  );

  const handleNewChat = useCallback(async () => {
    if (!sessionReady || loading) {
      return;
    }
    setError(null);
    setSidebarOpen(false);
    try {
      const id = await createConversation();
      setConversationId(id);
      setMessages([]);
      await reloadSidebar();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not start a new chat.'
      );
    }
  }, [loading, reloadSidebar, sessionReady]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || loading || !sessionReady) {
        return;
      }

      setError(null);
      setInput('');

      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setLoading(true);

      try {
        const { reply, conversationId: idFromSend } = await sendChatMessage({
          conversationId,
          message: text,
        });
        setConversationId(idFromSend ?? conversationId);
        try {
          const refreshed = await fetchChatHistory(
            idFromSend ?? conversationId
          );
          setMessages(refreshed.messages);
          setConversationId(
            refreshed.conversationId ?? idFromSend ?? conversationId
          );
        } catch {
          setError(
            'Message was saved, but the thread could not be refreshed. Try reloading the page.'
          );
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: reply },
          ]);
        }
        await reloadSidebar();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Something went wrong.';
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, input, loading, reloadSidebar, sessionReady]
  );

  const selectConversation = useCallback(
    (id: string) => {
      void openThread(id);
      setSidebarOpen(false);
    },
    [openThread]
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (!sessionReady) {
        return;
      }
      setError(null);
      try {
        await renameConversationApi(id, title);
        await reloadSidebar();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not rename chat.');
      }
    },
    [reloadSidebar, sessionReady]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!sessionReady) {
        return;
      }
      setError(null);
      try {
        await deleteConversationApi(id);
        const list = await fetchConversations();
        setConversations(list);
        if (conversationId === id) {
          if (list.length === 0) {
            const newId = await createConversation();
            setConversationId(newId);
            setMessages([]);
            const list2 = await fetchConversations();
            setConversations(list2);
          } else {
            await openThread(list[0].id);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete chat.');
      }
    },
    [conversationId, openThread, sessionReady]
  );

  const showThinking = useMemo(
    () => loading || initializing,
    [initializing, loading]
  );

  return {
    sessionReady,
    conversationId,
    conversations,
    messages,
    input,
    setInput,
    loading,
    initializing,
    error,
    sidebarOpen,
    setSidebarOpen,
    bottomRef,
    showThinking,
    handleSubmit,
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
  };
}
