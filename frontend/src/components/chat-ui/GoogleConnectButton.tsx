'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchGoogleConnectionStatus,
  fetchGoogleOAuthStartUrl,
} from '@/lib/google-oauth-api';

type Variant = 'sidebar' | 'default';

type Props = {
  sessionReady: boolean;
  variant?: Variant;
};

export function GoogleConnectButton({
  sessionReady,
  variant = 'default',
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!sessionReady) {
      return;
    }
    void fetchGoogleConnectionStatus()
      .then(setConnected)
      .catch(() => setConnected(false));
  }, [sessionReady]);

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

  useEffect(() => {
    const onGoogleConnectionChanged = () => {
      refresh();
    };

    window.addEventListener(
      'google-connection-changed',
      onGoogleConnectionChanged,
    );

    return () => {
      window.removeEventListener(
        'google-connection-changed',
        onGoogleConnectionChanged,
      );
    };
  }, [refresh]);

  const onConnect = useCallback(async () => {
    if (!sessionReady || busy) {
      return;
    }
    setBusy(true);
    try {
      const url = await fetchGoogleOAuthStartUrl();
      window.location.assign(url);
    } catch {
      setBusy(false);
    }
  }, [sessionReady, busy]);

  if (!sessionReady) {
    return null;
  }

  const isSidebar = variant === 'sidebar';

  if (connected === true) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted ${
          isSidebar ? 'w-full justify-center' : ''
        }`}
        title="Gmail & Calendar for this session"
      >
        <span
          className="h-1.5 w-1.5 rounded-full bg-success"
          aria-hidden
        />
        Google connected
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onConnect()}
      disabled={busy || connected === null}
      className={
        isSidebar
          ? 'w-full rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40'
          : 'rounded-[var(--radius-md)] border border-border bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40'
      }
      title="Connect Gmail & Google Calendar"
    >
      {connected === null ? '…' : busy ? 'Redirecting…' : 'Connect Google'}
    </button>
  );
}
