import { BrandLockup } from '@/components/BrandLockup';
import { SidebarConversationList } from '@/components/chat-ui/SidebarConversationList';
import type { ConversationSummary } from '@/lib/chat-api';

type Props = {
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  disabled: boolean;
};

export function ChatDesktopSidebar(props: Props) {
  return (
    <aside className="hidden h-full min-h-0 w-[min(100%,18rem)] shrink-0 flex-col border-r border-zinc-800/80 bg-[#181818] md:flex">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <BrandLockup size="md" />
      </div>
      <SidebarConversationList {...props} />
    </aside>
  );
}
