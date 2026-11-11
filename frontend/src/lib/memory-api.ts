import { getApiBaseUrl } from './api-base';

const cred: RequestInit = { credentials: 'include' };

export type MemoryItem = {
  id: number;
  content: string;
  createdAt: string;
};

async function readJson(res: Response): Promise<unknown> {
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Memory request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`,
    );
  }
  if (!rawText.trim()) {
    return null;
  }
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Memory response was not valid JSON.');
  }
}

function parseMemoryItem(value: unknown): MemoryItem | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as {
    id?: unknown;
    content?: unknown;
    createdAt?: unknown;
  };
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  if (typeof raw.content !== 'string') {
    return null;
  }
  if (typeof raw.createdAt !== 'string' || !raw.createdAt.trim()) {
    return null;
  }
  return {
    id,
    content: raw.content,
    createdAt: raw.createdAt,
  };
}

export async function listMemories(): Promise<MemoryItem[]> {
  const url = `${getApiBaseUrl()}/memory`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const data = await readJson(res);

  if (typeof data !== 'object' || data === null) {
    throw new Error('Memory list response was not an object.');
  }

  const memoriesRaw = (data as { memories?: unknown }).memories;
  if (!Array.isArray(memoriesRaw)) {
    return [];
  }

  const out: MemoryItem[] = [];
  for (const item of memoriesRaw) {
    const parsed = parseMemoryItem(item);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

export async function updateMemory(
  id: number,
  content: string,
): Promise<MemoryItem> {
  const url = `${getApiBaseUrl()}/memory/${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ content }),
  });
  const data = await readJson(res);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Memory update response was not an object.');
  }
  const memory = parseMemoryItem((data as { memory?: unknown }).memory);
  if (!memory) {
    throw new Error('Memory update response missing memory.');
  }
  return memory;
}

export async function deleteMemory(id: number): Promise<void> {
  const url = `${getApiBaseUrl()}/memory/${id}`;
  const res = await fetch(url, { method: 'DELETE', ...cred });
  await readJson(res);
}
