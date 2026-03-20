/**
 * Browser session + chat persistence for laura.
 *
 * Why `sessionId` in localStorage?
 * - The backend uses it as `userId` for memory (pgvector) so preferences stick across visits.
 * - Same browser profile → same id → same "personality" until they click "New chat".
 *
 * Why persist `messages` too?
 * - So a refresh doesn’t wipe the visible thread (nice for demos and local dev).
 * - This is **not** the source of truth for security-sensitive apps; it’s UX for MVP.
 */

const SESSION_KEY = 'laura_session_id';

function messagesKey(sessionId: string): string {
  return `laura_messages_${sessionId}`;
}

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

export function loadMessages(sessionId: string): StoredChatMessage[] {
  if (typeof window === 'undefined' || !sessionId) {
    return [];
  }
  const raw = window.localStorage.getItem(messagesKey(sessionId));
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: StoredChatMessage[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (role !== 'user' && role !== 'assistant') {
        continue;
      }
      if (typeof content !== 'string') {
        continue;
      }
      out.push({ role, content });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveMessages(
  sessionId: string,
  messages: StoredChatMessage[]
): void {
  if (typeof window === 'undefined' || !sessionId) {
    return;
  }
  window.localStorage.setItem(messagesKey(sessionId), JSON.stringify(messages));
}
