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
    <aside className="hidden w-[min(100%,18rem)] shrink-0 flex-col bg-[#181818] md:flex">
      <div className=" px-4 py-3 d">
        <BrandLockup size="md" />
      </div>
      <SidebarConversationList {...props} />
    </aside>
  );
}
