'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchGoogleConnectionStatus, fetchGoogleOAuthStartUrl } from '@/lib/google-oauth-api';
import { getOrCreateSessionId } from '@/lib/session';

export default function ConnectGooglePage() {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void fetchGoogleConnectionStatus(sessionId).then(setConnected).catch(() => {
      setConnected(false);
    });
  }, [sessionId]);

  const onConnect = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = await fetchGoogleOAuthStartUrl(sessionId);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Google OAuth');
      setBusy(false);
    }
  }, [sessionId]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-6 px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect Google
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Link Gmail (drafts) and Google Calendar for this browser session. See{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            docs/oauth-google-setup.md
          </code>{' '}
          for Cloud Console steps.
        </p>
      </div>

      {connected === true && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          Google is already connected for this session.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onConnect()}
          disabled={!sessionId || busy}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? 'Redirecting…' : 'Connect Google'}
        </button>
        <Link
          href="/"
          className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}
