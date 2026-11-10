import type { ActionReceipt } from './action-receipt';
import { parseActionReceipt } from './action-receipt';
import type { StoredChatMessage } from './session';
import { getApiBaseUrl } from './api-base';

const cred: RequestInit = { credentials: 'include' };

export type ChatApiResponse = {
  reply: string;
  conversationId?: string;
  receipt?: ActionReceipt;
};

export type ChatHistoryResponse = {
  conversationId?: string;
  messages: StoredChatMessage[];
};

export type ConversationSummary = {
  id: string;
  updatedAt: string;
  preview: string;
};

/**
 * Calls `POST /chat` on the NestJS backend.
 *
 * - `message` = the latest user text.
 * - `history` = everything before that turn (user/assistant pairs), so the model sees context.
 */
export async function sendChatMessage(input: {
  message: string;
  conversationId?: string;
  history?: StoredChatMessage[];
}): Promise<ChatApiResponse> {
  const url = `${getApiBaseUrl()}/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({
      conversationId: input.conversationId,
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

  const conversationIdRaw = (data as { conversationId?: unknown }).conversationId;
  const conversationId =
    typeof conversationIdRaw === 'string' && conversationIdRaw.trim()
      ? conversationIdRaw
      : undefined;

  return { reply, conversationId };
}

function consumeSseDataLine(
  jsonStr: string,
  onChunk: (chunk: string) => void,
  onReceipt?: (receipt: ActionReceipt) => void,
): string | undefined {
  let parsed: {
    chunk?: string;
    done?: boolean;
    started?: boolean;
    conversationId?: string;
    error?: string;
    receipt?: unknown;
  };

  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch {
    throw new Error('Chat stream returned a malformed event.');
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (parsed.started) {
    return undefined;
  }

  if (parsed.chunk) {
    onChunk(parsed.chunk);
  }

  const receipt = parseActionReceipt(parsed.receipt);
  if (receipt) {
    onReceipt?.(receipt);
  }

  if (parsed.done && parsed.conversationId) {
    return parsed.conversationId;
  }

  return undefined;
}

export async function sendChatMessageStream(
  input: {
    message: string;
    conversationId?: string;
    history?: StoredChatMessage[];
  },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ conversationId?: string; receipt?: ActionReceipt }> {
  const url = `${getApiBaseUrl()}/chat/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    signal,
    body: JSON.stringify({
      conversationId: input.conversationId,
      message: input.message,
      history: input.history,
    }),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    throw new Error(
      `Chat stream request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`,
    );
  }

  if (!res.body) {
    throw new Error('Chat response stream missing body.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalConversationId: string | undefined;
  let finalReceipt: ActionReceipt | undefined;

  const processBuffer = (flushAll: boolean) => {
    const lines = buffer.split('\n');
    if (!flushAll) {
      buffer = lines.pop() ?? '';
    } else {
      buffer = '';
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      const conversationIdFromEvent = consumeSseDataLine(
        jsonStr,
        onChunk,
        (receipt) => {
          finalReceipt = receipt;
        },
      );
      if (conversationIdFromEvent) {
        finalConversationId = conversationIdFromEvent;
      }
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      processBuffer(false);
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processBuffer(true);
    }
  } catch (err: unknown) {
    await reader.cancel().catch(() => undefined);
    throw err;
  }

  return {
    conversationId: finalConversationId,
    receipt: finalReceipt,
  };
}

export async function fetchChatHistory(
  conversationId?: string
): Promise<ChatHistoryResponse> {
  const cid = conversationId?.trim();
  const params = new URLSearchParams();
  if (cid) {
    params.set('conversationId', cid);
  }
  const url = `${getApiBaseUrl()}/chat/history${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `History request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('History response was not valid JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('History response was not an object.');
  }

  const messagesRaw = (data as { messages?: unknown }).messages;
  const out: StoredChatMessage[] = [];
  if (Array.isArray(messagesRaw)) {
    for (const item of messagesRaw) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
        out.push({ role, content });
      }
    }
  }

  const conversationIdRaw = (data as { conversationId?: unknown }).conversationId;
  const conversationIdFromResponse =
    typeof conversationIdRaw === 'string' && conversationIdRaw.trim()
      ? conversationIdRaw
      : undefined;

  return { conversationId: conversationIdFromResponse, messages: out };
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const url = `${getApiBaseUrl()}/chat/conversations`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Conversations request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Conversations response was not valid JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Conversations response was not an object.');
  }

  const list = (data as { conversations?: unknown }).conversations;
  const out: ConversationSummary[] = [];
  if (!Array.isArray(list)) {
    return [];
  }

  for (const item of list) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const id = (item as { id?: unknown }).id;
    const updatedAt = (item as { updatedAt?: unknown }).updatedAt;
    const preview = (item as { preview?: unknown }).preview;
    if (
      typeof id === 'string' &&
      typeof updatedAt === 'string' &&
      typeof preview === 'string'
    ) {
      out.push({ id, updatedAt, preview });
    }
  }


  return out;
}

export async function createConversation(): Promise<string> {
  const url = `${getApiBaseUrl()}/chat/conversations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({}),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Create conversation failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Create conversation response was not valid JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Create conversation response was not an object.');
  }

  const cid = (data as { conversationId?: unknown }).conversationId;
  if (typeof cid !== 'string' || !cid.trim()) {
    throw new Error('Missing conversationId in response.');
  }

  return cid.trim();
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<void> {
  const cid = conversationId.trim();
  if (!cid) {
    throw new Error('conversationId is required');
  }

  const url = `${getApiBaseUrl()}/chat/conversations/${encodeURIComponent(cid)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ title }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Rename failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const cid = conversationId.trim();
  if (!cid) {
    throw new Error('conversationId is required');
  }

  const url = `${getApiBaseUrl()}/chat/conversations/${encodeURIComponent(cid)}`;
  const res = await fetch(url, { method: 'DELETE', ...cred });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Delete failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`
    );
  }
}
