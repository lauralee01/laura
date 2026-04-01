import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { SidebarConversationList } from '@/components/chat-ui/SidebarConversationList';
import { IconClose } from '@/components/chat-ui/ChatIcons';
import type { ConversationSummary } from '@/lib/chat-api';

type Props = {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  disabled: boolean;
};

export function ChatMobileDrawer({
  sessionId,
  open,
  onClose,
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
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 flex h-full w-[min(100%,18rem)] flex-col border-r border-zinc-200/80 bg-zinc-100 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800/80">
          <div className="min-w-0 flex-1">
            <BrandLockup size="md" />
          </div>
          <GoogleConnectButton sessionId={sessionId} />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>
        <SidebarConversationList {...listProps} />
      </aside>
    </div>
  );
}
