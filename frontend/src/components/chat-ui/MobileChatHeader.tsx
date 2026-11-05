import { BrandLockup } from '@/components/BrandLockup';
import { GoogleConnectButton } from '@/components/chat-ui/GoogleConnectButton';
import { IconMenu } from '@/components/chat-ui/ChatIcons';

type Props = {
  sessionReady: boolean;
  onOpenSidebar: () => void;
};

export function MobileChatHeader({ sessionReady, onOpenSidebar }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface/80 px-3 py-2.5 backdrop-blur-sm md:hidden">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="shrink-0 rounded-[var(--radius-sm)] p-2 text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
        aria-label="Open chat history"
      >
        <IconMenu />
      </button>
      <div className="min-w-0 flex-1">
        <BrandLockup size="sm" />
      </div>
      <GoogleConnectButton sessionReady={sessionReady} />
    </header>
  );
}
