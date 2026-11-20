'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConversationSummary } from '@/lib/chat-api';
import type { StoredChatMessage } from '@/lib/session';
import { useChatBootstrap } from './chat/useChatBootstrap';
import { useChatScroll } from './chat/useChatScroll';
import { useChatStream } from './chat/useChatStream';
import { useChatThreads } from './chat/useChatThreads';

/**
 * Chat shell composer: shared transcript/session state + focused sub-hooks
 * for bootstrap, streaming, threads, and scroll.
 */
export function useChat() {
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<StoredChatMessage[]>([]);
  const reloadSidebarRef = useRef<() => Promise<void>>(async () => {});
  const pinToBottomRef = useRef<() => void>(() => {});
  const abortOnUnmountRef = useRef<() => void>(() => {});

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const { sessionReady, initializing, setInitializing } = useChatBootstrap({
    setConversations,
    setMessages,
    setConversationId,
    setError,
    onUnmountAbort: () => abortOnUnmountRef.current(),
  });

  const stream = useChatStream({
    sessionReady,
    conversationId,
    conversationIdRef,
    messages,
    setMessages,
    setConversationId,
    setError,
    reloadSidebar: () => reloadSidebarRef.current(),
    pinToBottom: () => pinToBottomRef.current(),
  });

  abortOnUnmountRef.current = stream.abortOnUnmount;

  const scroll = useChatScroll({
    messagesLength: messages.length,
    loading: stream.loading,
    initializing,
    streaming: stream.streaming,
  });

  pinToBottomRef.current = scroll.pinToBottom;

  const threads = useChatThreads({
    sessionReady,
    conversationId,
    conversationIdRef,
    messagesRef,
    loading: stream.loading,
    streaming: stream.streaming,
    setConversationId,
    setMessages,
    setConversations,
    setError,
    setInitializing,
    abortActiveStream: stream.abortActiveStream,
    pinToBottom: scroll.pinToBottom,
  });

  reloadSidebarRef.current = threads.reloadSidebar;

  const isBusy =
    stream.loading ||
    stream.streaming ||
    threads.creatingConversation ||
    initializing;

  return {
    sessionReady,
    conversationId,
    conversations,
    messages,
    input: stream.input,
    setInput: stream.setInput,
    loading: stream.loading,
    streaming: stream.streaming,
    initializing,
    creatingConversation: threads.creatingConversation,
    isBusy,
    /** True while a reply is in flight (thinking or streaming tokens). */
    isGenerating: stream.loading || stream.streaming,
    error,
    setError,
    sidebarOpen: threads.sidebarOpen,
    setSidebarOpen: threads.setSidebarOpen,
    bottomRef: scroll.bottomRef,
    scrollContainerRef: scroll.scrollContainerRef,
    updateStickToBottom: scroll.updateStickToBottom,
    showThinking: stream.loading && !stream.streaming,
    statusLabel: stream.statusLabel,
    handleSubmit: stream.handleSubmit,
    sendMessage: stream.sendMessage,
    stopStreaming: stream.stopStreaming,
    handleNewChat: threads.handleNewChat,
    selectConversation: threads.selectConversation,
    renameConversation: threads.renameConversation,
    deleteConversation: threads.deleteConversation,
    copyConversation: threads.copyConversation,
  };
}
