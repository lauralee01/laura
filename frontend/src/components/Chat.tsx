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
    disabled: sidebarDisabled,
  };

  return (
    <div className="flex h-[100dvh]text-zinc-900 dark:text-zinc-100">
      <ChatDesktopSidebar {...sidebarProps} />

      <ChatMobileDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        {...sidebarProps}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileChatHeader onOpenSidebar={() => setSidebarOpen(true)} />

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
