/**
 * Server-issued anonymous session (HttpOnly cookie). Call `ensureSession` before other API calls.
 */

export type StoredChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

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
