'use client';

import { useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import {
  ChatComposer,
  ChatDesktopSidebar,
  ChatErrorBanner,
  ChatMessageList,
  ChatMobileDrawer,
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
    handleNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
    initializing,
    isBusy,
  } = useChat();

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

  const sidebarProps = {
    conversations,
    activeId: conversationId,
    onSelect: selectConversation,
    onNewChat,
    onRename,
    onDelete,
    disabled: sidebarDisabled,
  };

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
        />

        {error && (
          <div className="shrink-0 px-3 md:px-6">
            <ChatErrorBanner
              message={error}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        <ChatComposer
          input={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={composerDisabled}
        />
      </div>
    </div>
  );
}
