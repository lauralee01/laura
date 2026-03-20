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
    <aside className="hidden w-[min(100%,18rem)] shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-100/90 dark:border-zinc-800/80 dark:bg-zinc-950 md:flex">
      <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800/80">
        <BrandLockup size="md" />
      </div>
      <SidebarConversationList {...props} />
    </aside>
  );
}
