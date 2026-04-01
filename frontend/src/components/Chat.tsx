'use client';

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
    sessionId,
    conversationId,
    conversations,
    messages,
    input,
    setInput,
    loading,
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
  } = useChat();

  const sidebarDisabled = loading || !sessionId;
  const composerDisabled = loading || !sessionId;

  const sidebarProps = {
    conversations,
    activeId: conversationId,
    onSelect: selectConversation,
    onNewChat: () => {
      void handleNewChat();
    },
    onRename: (id: string, title: string) => {
      void renameConversation(id, title);
    },
    onDelete: (id: string) => {
      void deleteConversation(id);
    },
    disabled: sidebarDisabled,
  };

  return (
    <div className="flex h-[100dvh] min-h-0 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ChatDesktopSidebar sessionId={sessionId} {...sidebarProps} />

      <ChatMobileDrawer
        sessionId={sessionId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        {...sidebarProps}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileChatHeader
          sessionId={sessionId}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <ChatMessageList
          messages={messages}
          showThinking={showThinking}
          bottomRef={bottomRef}
        />

        {error && <ChatErrorBanner message={error} />}

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
