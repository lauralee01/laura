'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DoneContent() {
  const search = useSearchParams();
  const google = search.get('google');
  const reason = search.get('reason');
  const fp = search.get('fp');

  let title = 'Google connection';
  let body: string | null = null;
  let tone: 'ok' | 'warn' | 'err' = 'ok';

  if (google === 'connected') {
    title = 'Google connected';
    body =
      fp != null
        ? `You can return to chat. (Session fingerprint: ${fp})`
        : 'You can return to chat.';
    tone = 'ok';
  } else if (google === 'cancelled') {
    title = 'Cancelled';
    body = 'You did not grant access. You can try again anytime.';
    tone = 'warn';
  } else if (google === 'error') {
    title = 'Something went wrong';
    body = reason || 'OAuth failed. Check backend logs and Google Cloud settings.';
    tone = 'err';
  } else {
    body = 'Unexpected callback. Use Connect Google on the chat screen to try again.';
    tone = 'warn';
  }

  const box =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50'
        : 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-50';

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-6 px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {body && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${box}`}>{body}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}

export default function GoogleOAuthDonePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-zinc-500">
          Loading…
        </div>
      }
    >
      <DoneContent />
    </Suspense>
  );
}
