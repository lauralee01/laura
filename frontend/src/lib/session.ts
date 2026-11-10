/**
 * Server-issued anonymous session (HttpOnly cookie). Call `ensureSession` before other API calls.
 */

import { getApiBaseUrl } from './api-base';

import type { ActionReceipt } from './action-receipt';
import type { ConfirmPrompt } from './confirm-prompt';

export type StoredChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** Ephemeral tool receipt for the live turn (not restored from history). */
  receipt?: ActionReceipt;
  /** Ephemeral Confirm/Cancel chips for the live turn (not restored from history). */
  confirmPrompt?: ConfirmPrompt;
};

/**
 * Hits `GET /session` with credentials so the API sets/refreshes the `laura_session` cookie.
 * Safe to call more than once.
 */
export async function ensureSession(): Promise<void> {
  const url = `${getApiBaseUrl()}/session`;
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Session bootstrap failed (${res.status})`);
  }
}

/**
 * Syncs the browser timezone with the server. This should be called after `ensureSession`.
 */
export async function syncBrowserTimeZone(): Promise<void> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!timeZone) return;

  await fetch(`${getApiBaseUrl()}/session`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timeZone }),
  });
}
