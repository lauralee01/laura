'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Toast = {
  message: string;
  variant: 'success' | 'warn' | 'error';
} | null;

export function GoogleOAuthReturnToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const google = searchParams.get('google');
    if (!google) {
      return;
    }

    let message: string;
    let variant: 'success' | 'warn' | 'error';

    if (google === 'connected') {
      message = 'Google connected.';
      variant = 'success';
    } else if (google === 'cancelled') {
      message = 'Google sign-in was cancelled.';
      variant = 'warn';
    } else if (google === 'error') {
      const raw =
        searchParams.get('reason')?.trim() ||
        'Something went wrong connecting Google.';
      message = raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
      variant = 'error';
    } else {
      router.replace('/', { scroll: false });
      return;
    }

    queueMicrotask(() => {
      setToast({ message, variant });
    });
    router.replace('/', { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const id = window.setTimeout(dismiss, 5000);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);

  if (!toast) {
    return null;
  }

  const box =
    toast.variant === 'success'
      ? 'border-emerald-500/35 bg-emerald-950/90 text-emerald-50'
      : toast.variant === 'warn'
        ? 'border-amber-500/35 bg-amber-950/90 text-amber-50'
        : 'border-red-500/35 bg-red-950/90 text-red-50';

  return (
    <div
      role="status"
      className={`fixed top-4 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md ${box}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
