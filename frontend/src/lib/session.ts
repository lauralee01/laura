/**
 * Browser session id for laura.
 */

const SESSION_KEY = 'laura_session_id';

export type StoredChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const existing = window.localStorage.getItem(SESSION_KEY)?.trim();
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export function rotateSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}
