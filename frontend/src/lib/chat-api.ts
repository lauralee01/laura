import type { StoredChatMessage } from './session';

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

export type ChatApiResponse = {
  reply: string;
};

/**
 * Calls `POST /chat` on the NestJS backend.
 *
 * - `message` = the latest user text.
 * - `history` = everything before that turn (user/assistant pairs), so the model sees context.
 */
export async function sendChatMessage(input: {
  sessionId: string;
  message: string;
  history: StoredChatMessage[];
}): Promise<ChatApiResponse> {
  const url = `${getApiBaseUrl()}/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: input.sessionId,
      message: input.message,
      history: input.history,
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Chat request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Chat response was not valid JSON.');
  }

  if (typeof data !== 'object' || data === null || !('reply' in data)) {
    throw new Error('Chat response missing `reply`.');
  }

  const reply = (data as { reply?: unknown }).reply;
  if (typeof reply !== 'string') {
    throw new Error('Chat response `reply` was not a string.');
  }

  return { reply };
}
