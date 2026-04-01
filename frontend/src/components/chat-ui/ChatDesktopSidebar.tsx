import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { SidebarConversationList } from '@/components/chat-ui/SidebarConversationList';
import type { ConversationSummary } from '@/lib/chat-api';

type Props = {
  sessionId: string;
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  disabled: boolean;
};

export function ChatDesktopSidebar({ sessionId, ...props }: Props) {
  return (
    <aside className="hidden h-full min-h-0 w-[min(100%,18rem)] shrink-0 flex-col border-r border-zinc-800/80 bg-[#181818] md:flex">
      <div className="flex flex-col gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <BrandLockup size="md" />
          <GoogleConnectButton sessionId={sessionId} variant="sidebar" />
        </div>
      </div>
      <SidebarConversationList {...props} />
    </aside>
  );
}
