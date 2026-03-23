import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { IconMenu } from '@/components/chat-ui/ChatIcons';

type Props = {
  sessionId: string;
  onOpenSidebar: () => void;
};

export function MobileChatHeader({ sessionId, onOpenSidebar }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800/80 md:hidden">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="shrink-0 rounded-lg p-2 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
        aria-label="Open chat history"
      >
        <IconMenu />
      </button>
      <div className="min-w-0 flex-1">
        <BrandLockup size="sm" />
      </div>
      <GoogleConnectButton sessionId={sessionId} />
    </header>
  );
}
