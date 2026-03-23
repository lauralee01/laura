'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchGoogleConnectionStatus,
  fetchGoogleOAuthStartUrl,
} from '@/lib/google-oauth-api';

type Variant = 'sidebar' | 'default';

type Props = {
  sessionId: string;
  /** Dark sidebar (`#181818`) vs main chrome */
  variant?: Variant;
};

export function GoogleConnectButton({
  sessionId,
  variant = 'default',
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    const sid = sessionId.trim();
    if (!sid) {
      return;
    }
    void fetchGoogleConnectionStatus(sid)
      .then(setConnected)
      .catch(() => setConnected(false));
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  const onConnect = useCallback(async () => {
    if (!sessionId.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      const url = await fetchGoogleOAuthStartUrl(sessionId);
      window.location.assign(url);
    } catch {
      setBusy(false);
    }
  }, [sessionId, busy]);

  if (!sessionId.trim()) {
    return null;
  }

  const isSidebar = variant === 'sidebar';

  const connectedClasses = isSidebar
    ? 'text-[11px] font-medium text-zinc-500'
    : 'text-[11px] font-medium text-zinc-500 dark:text-zinc-400';

  const buttonClasses = isSidebar
    ? 'rounded-lg border border-zinc-600 bg-zinc-800/60 px-2.5 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40'
    : 'rounded-lg border border-zinc-300 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800';

  if (connected === true) {
    return (
      <span className={connectedClasses} title="Gmail & Calendar for this session">
        Google connected
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onConnect()}
      disabled={busy || connected === null}
      className={buttonClasses}
      title="Connect Gmail & Google Calendar"
    >
      {connected === null ? '…' : busy ? 'Redirecting…' : 'Connect Google'}
    </button>
  );
}
