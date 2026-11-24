'use client';

import { useCallback, useState } from 'react';
import {
  describeLocationError,
  detectBrowserLocation,
} from '@/lib/browser-location';
import type { ConfirmPrompt } from '@/lib/confirm-prompt';

/** Id of the chat textarea, so "Type a city" can focus it. */
export const COMPOSER_INPUT_ID = 'laura-composer-input';

type Props = {
  prompt: ConfirmPrompt;
  disabled?: boolean;
  /** Called with the detected city; the chat sends it as the user's answer. */
  onLocation: (city: string) => void;
};

type Status = 'idle' | 'detecting' | 'error';

/**
 * "Use my current location" chip. Unlike the yes/no chips it does not send a
 * canned message: it asks the browser for permission, resolves a city, then
 * answers Laura's question with that city.
 */
export function LocationChipStrip({ prompt, disabled, onLocation }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const detecting = status === 'detecting';

  const shareCurrentLocation = useCallback(async () => {
    setStatus('detecting');
    setMessage(null);
    try {
      const city = await detectBrowserLocation();
      setStatus('idle');
      onLocation(city);
    } catch (error: unknown) {
      setStatus('error');
      setMessage(describeLocationError(error));
    }
  }, [onLocation]);

  const typeCity = useCallback(() => {
    document.getElementById(COMPOSER_INPUT_ID)?.focus();
  }, []);

  return (
    <div className="mt-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Choose how to share your location"
      >
        <button
          type="button"
          className="laura-chip cursor-pointer rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || detecting}
          onClick={() => void shareCurrentLocation()}
        >
          {detecting ? 'Finding your city…' : prompt.confirmLabel}
        </button>
        <button
          type="button"
          className="laura-chip cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          disabled={detecting}
          onClick={typeCity}
        >
          {prompt.cancelLabel}
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-2 text-xs text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
