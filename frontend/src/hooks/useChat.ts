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
import { getOrCreateSessionId, type StoredChatMessage } from '@/lib/session';

export function useChat() {
  const [sessionId, setSessionId] = useState('');
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

  const reloadSidebar = useCallback(async (sid: string) => {
    try {
      const list = await fetchConversations(sid);
      setConversations(list);
    } catch {
      /* keep existing list */
    }
  }, []);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);
    setMessages([]);
    setInitializing(true);
    setError(null);

    Promise.all([fetchConversations(sid), fetchChatHistory(sid)])
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
      if (!sessionId) {
        return;
      }
      setInitializing(true);
      setError(null);
      setConversationId(id);
      try {
        const hist = await fetchChatHistory(sessionId, id);
        setMessages(hist.messages);
        setConversationId(hist.conversationId ?? id);
      } catch {
        setError('Could not load this chat.');
      } finally {
        setInitializing(false);
      }
    },
    [sessionId]
  );

  const handleNewChat = useCallback(async () => {
    if (!sessionId || loading) {
      return;
    }
    setError(null);
    setSidebarOpen(false);
    try {
      const id = await createConversation(sessionId);
      setConversationId(id);
      setMessages([]);
      await reloadSidebar(sessionId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not start a new chat.'
      );
    }
  }, [loading, reloadSidebar, sessionId]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || loading || !sessionId) {
        return;
      }

      setError(null);
      setInput('');

      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setLoading(true);

      try {
        const { reply, conversationId: idFromSend } = await sendChatMessage({
          sessionId,
          conversationId,
          message: text,
        });
        setConversationId(idFromSend ?? conversationId);
        try {
          const refreshed = await fetchChatHistory(
            sessionId,
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
        await reloadSidebar(sessionId);
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
    [conversationId, input, loading, reloadSidebar, sessionId]
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
      if (!sessionId) {
        return;
      }
      setError(null);
      try {
        await renameConversationApi(sessionId, id, title);
        await reloadSidebar(sessionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not rename chat.');
      }
    },
    [reloadSidebar, sessionId]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!sessionId) {
        return;
      }
      if (
        !window.confirm(
          'Delete this conversation? This cannot be undone.'
        )
      ) {
        return;
      }
      setError(null);
      try {
        await deleteConversationApi(sessionId, id);
        const list = await fetchConversations(sessionId);
        setConversations(list);
        if (conversationId === id) {
          if (list.length === 0) {
            const newId = await createConversation(sessionId);
            setConversationId(newId);
            setMessages([]);
            const list2 = await fetchConversations(sessionId);
            setConversations(list2);
          } else {
            await openThread(list[0].id);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete chat.');
      }
    },
    [conversationId, openThread, sessionId]
  );

  const showThinking = useMemo(
    () => loading || initializing,
    [initializing, loading]
  );

  return {
    sessionId,
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
