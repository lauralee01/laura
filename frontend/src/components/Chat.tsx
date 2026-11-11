'use client';

import { useCallback, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import {
  ChatComposer,
  ChatDesktopSidebar,
  ChatErrorBanner,
  ChatMessageList,
  ChatMobileDrawer,
  GoogleConnectTip,
  MemoryBrowserPanel,
  MobileChatHeader,
} from '@/components/chat-ui';

export function Chat() {
  const {
    sessionReady,
    conversationId,
    conversations,
    messages,
    input,
    setInput,
    streaming,
    error,
    setError,
    sidebarOpen,
    setSidebarOpen,
    bottomRef,
    scrollContainerRef,
    updateStickToBottom,
    showThinking,
    handleSubmit,
    sendMessage,
    stopStreaming,
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
    initializing,
    isBusy,
    isGenerating,
  } = useChat();

  const [memoriesOpen, setMemoriesOpen] = useState(false);

  /*
   * Keep composer + sidebar locked for the full stream lifecycle, not just
   * until the first token (loading used to flip false on first chunk).
   */
  const sidebarDisabled = isBusy || !sessionReady;
  const composerDisabled = isBusy || !sessionReady;

  const onNewChat = useCallback(() => {
    void handleNewChat();
  }, [handleNewChat]);

  const onRename = useCallback(
    (id: string, title: string) => {
      void renameConversation(id, title);
    },
    [renameConversation],
  );

  const onDelete = useCallback(
    (id: string) => {
      void deleteConversation(id);
    },
    [deleteConversation],
  );

  const onCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, [setSidebarOpen]);

  const onOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const onSuggestion = useCallback(
    (prompt: string) => {
      setInput(prompt);
    },
    [setInput],
  );

  const onOpenMemories = useCallback(() => {
    setSidebarOpen(false);
    setMemoriesOpen(true);
  }, [setSidebarOpen]);

  const onCloseMemories = useCallback(() => {
    setMemoriesOpen(false);
  }, []);

  const sidebarProps = {
    conversations,
    activeId: conversationId,
    onSelect: selectConversation,
    onNewChat,
    onRename,
    onDelete,
    disabled: sidebarDisabled,
    onOpenMemories,
  };

  /**
   * This is the main component that renders the chat interface.
   * It renders the desktop sidebar, mobile drawer, message list, error banner,
   * google connect tip, and composer.
   * @returns {JSX.Element} The chat interface.
   */

  return (
    <div className="flex h-[100dvh] min-h-0 bg-transparent text-ink">
      <ChatDesktopSidebar sessionReady={sessionReady} {...sidebarProps} />

      <ChatMobileDrawer
        sessionReady={sessionReady}
        open={sidebarOpen}
        onClose={onCloseSidebar}
        {...sidebarProps}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileChatHeader
          sessionReady={sessionReady}
          onOpenSidebar={onOpenSidebar}
        />

        <ChatMessageList
          messages={messages}
          showThinking={showThinking}
          streaming={streaming}
          bottomRef={bottomRef}
          scrollContainerRef={scrollContainerRef}
          onScroll={updateStickToBottom}
          initializing={initializing}
          onSuggestion={onSuggestion}
          onSendSuggestion={sendMessage}
          suggestionsDisabled={composerDisabled}
          chipsDisabled={composerDisabled}
          onConfirmChip={sendMessage}
        />

        {error && (
          <div className="shrink-0 px-3 md:px-6">
            <ChatErrorBanner
              message={error}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        <div className="shrink-0 px-3 md:px-6">
          <GoogleConnectTip sessionReady={sessionReady} />
        </div>

        <ChatComposer
          input={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={stopStreaming}
          isGenerating={isGenerating}
          disabled={composerDisabled}
        />
      </div>

      <MemoryBrowserPanel
        open={memoriesOpen}
        onClose={onCloseMemories}
        sessionReady={sessionReady}
      />
    </div>
  );
}
