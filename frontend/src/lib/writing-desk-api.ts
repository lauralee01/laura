import { getApiBaseUrl } from './api-base';

const cred: RequestInit = { credentials: 'include' };

export type WritingDraftSummary = {
  id: number;
  title: string;
  tone: string | null;
  preview: string;
  updatedAt: string;
};

export type WritingDraftVersion = {
  body: string;
  tone: string | null;
  savedAt: string;
};

export type WritingDraft = {
  id: number;
  title: string;
  body: string;
  tone: string | null;
  versions: WritingDraftVersion[];
  createdAt: string;
  updatedAt: string;
};

async function readJson(res: Response): Promise<unknown> {
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Writing desk request failed (${res.status}). ${rawText ? rawText.slice(0, 200) : ''}`,
    );
  }
  if (!rawText.trim()) {
    return null;
  }
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error('Writing desk response was not valid JSON.');
  }
}

function parseSummary(value: unknown): WritingDraftSummary | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  if (typeof raw.title !== 'string') {
    return null;
  }
  if (typeof raw.preview !== 'string') {
    return null;
  }
  if (typeof raw.updatedAt !== 'string' || !raw.updatedAt.trim()) {
    return null;
  }
  const tone =
    typeof raw.tone === 'string'
      ? raw.tone
      : raw.tone === null
        ? null
        : null;
  return {
    id,
    title: raw.title,
    tone,
    preview: raw.preview,
    updatedAt: raw.updatedAt,
  };
}

function parseDraft(value: unknown): WritingDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  if (typeof raw.title !== 'string' || typeof raw.body !== 'string') {
    return null;
  }
  if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return null;
  }
  const tone =
    typeof raw.tone === 'string'
      ? raw.tone
      : raw.tone === null
        ? null
        : null;
  const versions: WritingDraftVersion[] = [];
  if (Array.isArray(raw.versions)) {
    for (const item of raw.versions) {
      if (!item || typeof item !== 'object') continue;
      const v = item as Record<string, unknown>;
      if (typeof v.body !== 'string') continue;
      versions.push({
        body: v.body,
        tone: typeof v.tone === 'string' ? v.tone : null,
        savedAt:
          typeof v.savedAt === 'string' && v.savedAt.trim()
            ? v.savedAt
            : new Date().toISOString(),
      });
    }
  }
  return {
    id,
    title: raw.title,
    body: raw.body,
    tone,
    versions,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listWritingDrafts(): Promise<WritingDraftSummary[]> {
  const url = `${getApiBaseUrl()}/writing-desk`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const data = await readJson(res);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Writing desk list response was not an object.');
  }
  const draftsRaw = (data as { drafts?: unknown }).drafts;
  if (!Array.isArray(draftsRaw)) {
    return [];
  }
  const out: WritingDraftSummary[] = [];
  for (const item of draftsRaw) {
    const parsed = parseSummary(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function getWritingDraft(id: number): Promise<WritingDraft> {
  const url = `${getApiBaseUrl()}/writing-desk/${id}`;
  const res = await fetch(url, { method: 'GET', ...cred });
  const data = await readJson(res);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Writing desk get response was not an object.');
  }
  const draft = parseDraft((data as { draft?: unknown }).draft);
  if (!draft) {
    throw new Error('Writing desk get response missing draft.');
  }
  return draft;
}

export async function createWritingDraft(input: {
  title: string;
  body: string;
  tone?: string | null;
}): Promise<WritingDraft> {
  const url = `${getApiBaseUrl()}/writing-desk`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Writing desk create response was not an object.');
  }
  const draft = parseDraft((data as { draft?: unknown }).draft);
  if (!draft) {
    throw new Error('Writing desk create response missing draft.');
  }
  return draft;
}

export async function updateWritingDraft(
  id: number,
  input: { title?: string; body?: string; tone?: string | null },
): Promise<WritingDraft> {
  const url = `${getApiBaseUrl()}/writing-desk/${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Writing desk update response was not an object.');
  }
  const draft = parseDraft((data as { draft?: unknown }).draft);
  if (!draft) {
    throw new Error('Writing desk update response missing draft.');
  }
  return draft;
}

export async function deleteWritingDraft(id: number): Promise<void> {
  const url = `${getApiBaseUrl()}/writing-desk/${id}`;
  const res = await fetch(url, { method: 'DELETE', ...cred });
  await readJson(res);
}
