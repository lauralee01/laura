'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchGoogleConnectionStatus,
  fetchGoogleOAuthStartUrl,
} from '@/lib/google-oauth-api';
import { IconClose } from '@/components/chat-ui/ChatIcons';

const STORAGE_KEY = 'laura.googleConnectTipDismissed';

type Props = {
  sessionReady: boolean;
};

export function GoogleConnectTip({ sessionReady }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshVisibility = useCallback(() => {
    if (!sessionReady || typeof window === 'undefined') {
      setVisible(false);
      return;
    }

    if (window.localStorage.getItem(STORAGE_KEY) === '1') {
      setVisible(false);
      return;
    }

    void fetchGoogleConnectionStatus()
      .then((connected) => {
        setVisible(!connected);
      })
      .catch(() => {
        setVisible(false);
      });
  }, [sessionReady]);

  useEffect(() => {
    refreshVisibility();
  }, [refreshVisibility]);

  useEffect(() => {
    const onChanged = () => refreshVisibility();
    window.addEventListener('google-connection-changed', onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      window.removeEventListener('google-connection-changed', onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [refreshVisibility]);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }, []);

  const onConnect = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const url = await fetchGoogleOAuthStartUrl();
      window.location.assign(url);
    } catch {
      setBusy(false);
    }
  }, [busy]);

  if (!visible) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-accent-soft/70 px-3.5 py-2.5 text-sm text-ink">
      <p className="min-w-0 flex-1 leading-snug text-ink-muted">
        Connect Google for Calendar &amp; Gmail.
      </p>
      <button
        type="button"
        onClick={() => void onConnect()}
        disabled={busy}
        className="shrink-0 rounded-[var(--radius-sm)] bg-accent px-2.5 py-1 text-xs font-medium text-surface-elevated transition hover:bg-accent-hover disabled:opacity-40"
      >
        {busy ? 'Redirecting…' : 'Connect'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-muted transition hover:bg-canvas-mid hover:text-ink"
        aria-label="Dismiss Google tip"
      >
        <IconClose className="h-4 w-4" />
      </button>
    </div>
  );
}
