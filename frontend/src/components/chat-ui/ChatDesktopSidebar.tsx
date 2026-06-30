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

export function ChatDesktopSidebar({ sessionReady, ...props }: Props) {
  return (
    <aside className="hidden h-full min-h-0 w-[min(100%,18rem)] shrink-0 flex-col border-r border-zinc-800/80 bg-[#181818] md:flex">
      <div className="flex flex-col gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <BrandLockup size="md" />
          <GoogleConnectButton sessionReady={sessionReady} variant="sidebar" />
        </div>
      </div>
      <SidebarConversationList {...props} />
      <footer className="shrink-0 border-t border-zinc-800/80 px-4 py-3 text-center text-[11px] text-zinc-600">
        <span>© {new Date().getFullYear()} Laura</span>
        <span className="mx-1.5">•</span>
        <a href="/privacy" className="transition hover:text-zinc-300">
          Privacy
        </a>
        <span className="mx-1.5">•</span>
        <a href="/terms" className="transition hover:text-zinc-300">
          Terms
        </a>
      </footer>
    </aside>
  );
}
