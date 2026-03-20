import { formatChatDate } from '@/lib/format-chat-date';
import type { ConversationSummary } from '@/lib/chat-api';
import { IconPlus } from '@/components/chat-ui/ChatIcons';

type Props = {
  conversations: ConversationSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  disabled: boolean;
};

export function SidebarConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  disabled,
}: Props) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Chats
        </span>
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-200/80 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="New chat"
        >
          <IconPlus />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? 'bg-zinc-200/90 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="line-clamp-2 font-medium leading-snug">
                    {c.preview}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
                    {formatChatDate(c.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
