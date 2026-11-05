import { memo } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { SidebarConversationList } from '@/components/chat-ui/SidebarConversationList';
import type { ConversationSummary } from '@/lib/chat-api';

type Props = {
  sessionReady: boolean;
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  disabled: boolean;
};

export const ChatDesktopSidebar = memo(function ChatDesktopSidebar({
  sessionReady,
  ...props
}: Props) {
  return (
    <aside className="hidden h-full min-h-0 w-[min(100%,17.5rem)] shrink-0 flex-col border-r border-border-subtle bg-surface/90 backdrop-blur-sm md:flex">
      <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <BrandLockup size="md" />
        </div>
      </div>
      <SidebarConversationList {...props} />
      <footer className="shrink-0 space-y-2.5 border-t border-border-subtle px-4 py-3">
        <GoogleConnectButton sessionReady={sessionReady} variant="sidebar" />
        <p className="text-center text-[11px] text-ink-muted">
          <span>© {new Date().getFullYear()} Laura</span>
          <span className="mx-1.5">·</span>
          <a href="/privacy" className="transition hover:text-ink">
            Privacy
          </a>
          <span className="mx-1.5">·</span>
          <a href="/terms" className="transition hover:text-ink">
            Terms
          </a>
        </p>
      </footer>
    </aside>
  );
});
