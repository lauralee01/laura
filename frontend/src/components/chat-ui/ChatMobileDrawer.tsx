import { memo } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { SidebarConversationList } from '@/components/chat-ui/SidebarConversationList';
import { IconClose } from '@/components/chat-ui/ChatIcons';
import type { ConversationSummary } from '@/lib/chat-api';

type Props = {
  sessionReady: boolean;
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  disabled: boolean;
  onOpenMemories?: () => void;
};

export const ChatMobileDrawer = memo(function ChatMobileDrawer({
  sessionReady,
  open,
  onClose,
  onOpenMemories,
  ...listProps
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Chat history"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 flex h-full w-[min(100%,17.5rem)] flex-col border-r border-border-subtle bg-surface shadow-soft">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-3">
          <div className="min-w-0 flex-1">
            <BrandLockup size="md" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[var(--radius-sm)] p-2 text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>
        <SidebarConversationList {...listProps} />
        <div className="shrink-0 space-y-2 border-t border-border-subtle px-4 py-3">
          <GoogleConnectButton sessionReady={sessionReady} variant="sidebar" />
          {onOpenMemories ? (
            <button
              type="button"
              onClick={onOpenMemories}
              disabled={!sessionReady}
              className="w-full rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-xs font-medium text-ink transition hover:border-accent/30 hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Memories
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
});
