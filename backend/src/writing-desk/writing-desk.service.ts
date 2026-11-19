import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import {
  MAX_WRITING_DRAFT_VERSIONS,
  type WritingDraft,
  type WritingDraftSummary,
  type WritingDraftVersion,
} from './writing-desk.types';

type DraftRow = {
  id: number;
  title: string;
  body: string;
  tone: string | null;
  versions: unknown;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class WritingDeskService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing. Set it in backend/.env');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  async listDrafts(sessionId: string): Promise<WritingDraftSummary[]> {
    const sid = sessionId.trim();
    if (!sid) {
      return [];
    }

    const res = await this.pool.query<{
      id: number;
      title: string;
      body: string;
      tone: string | null;
      updated_at: Date;
    }>(
      `
      SELECT id, title, body, tone, updated_at
      FROM writing_drafts
      WHERE session_id = $1
      ORDER BY updated_at DESC, id DESC;
      `,
      [sid],
    );

    return res.rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      tone: row.tone,
      preview: truncate(row.body.replace(/\s+/g, ' ').trim(), 96),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getDraft(
    sessionId: string,
    id: number,
  ): Promise<WritingDraft | null> {
    const sid = sessionId.trim();
    if (!sid || !Number.isFinite(id) || id <= 0) {
      return null;
    }

    const res = await this.pool.query<DraftRow>(
      `
      SELECT id, title, body, tone, versions, created_at, updated_at
      FROM writing_drafts
      WHERE id = $1 AND session_id = $2
      LIMIT 1;
      `,
      [id, sid],
    );

    const row = res.rows[0];
    return row ? mapDraft(row) : null;
  }

  async createDraft(
    sessionId: string,
    input: { title: string; body: string; tone?: string | null },
  ): Promise<WritingDraft> {
    const sid = sessionId.trim();
    const title = input.title.trim() || 'Untitled draft';
    const body = input.body.trim();
    if (!sid) {
      throw new Error('sessionId is required');
    }
    if (!body) {
      throw new Error('body must not be empty');
    }

    const tone = normalizeTone(input.tone);

    const res = await this.pool.query<DraftRow>(
      `
      INSERT INTO writing_drafts (session_id, title, body, tone)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, body, tone, versions, created_at, updated_at;
      `,
      [sid, title, body, tone],
    );

    return mapDraft(res.rows[0]);
  }

  async updateDraft(
    sessionId: string,
    id: number,
    input: { title?: string; body?: string; tone?: string | null },
  ): Promise<WritingDraft | null> {
    const existing = await this.getDraft(sessionId, id);
    if (!existing) {
      return null;
    }

    const nextTitle =
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : existing.title;
    const nextBody =
      typeof input.body === 'string' ? input.body.trim() : existing.body;
    if (!nextBody) {
      throw new Error('body must not be empty');
    }

    const toneProvided = Object.prototype.hasOwnProperty.call(input, 'tone');
    const nextTone = toneProvided
      ? normalizeTone(input.tone)
      : existing.tone;

    const bodyChanged = nextBody !== existing.body;
    const toneChanged = nextTone !== existing.tone;
    const versions =
      bodyChanged || toneChanged
        ? pushVersion(existing.versions, {
            body: existing.body,
            tone: existing.tone,
            savedAt: new Date().toISOString(),
          })
        : existing.versions;

    const res = await this.pool.query<DraftRow>(
      `
      UPDATE writing_drafts
      SET title = $3,
          body = $4,
          tone = $5,
          versions = $6::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND session_id = $2
      RETURNING id, title, body, tone, versions, created_at, updated_at;
      `,
      [
        id,
        sessionId.trim(),
        nextTitle,
        nextBody,
        nextTone,
        JSON.stringify(versions),
      ],
    );

    const row = res.rows[0];
    return row ? mapDraft(row) : null;
  }

  async deleteDraft(sessionId: string, id: number): Promise<boolean> {
    const sid = sessionId.trim();
    if (!sid || !Number.isFinite(id) || id <= 0) {
      return false;
    }

    const res = await this.pool.query(
      `
      DELETE FROM writing_drafts
      WHERE id = $1 AND session_id = $2;
      `,
      [id, sid],
    );

    return (res.rowCount ?? 0) > 0;
  }
}

function normalizeTone(tone: string | null | undefined): string | null {
  if (typeof tone !== 'string') {
    return null;
  }
  const trimmed = tone.trim();
  return trimmed || null;
}

function pushVersion(
  current: WritingDraftVersion[],
  next: WritingDraftVersion,
): WritingDraftVersion[] {
  return [next, ...current].slice(0, MAX_WRITING_DRAFT_VERSIONS);
}

function parseVersions(raw: unknown): WritingDraftVersion[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: WritingDraftVersion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.body !== 'string') {
      continue;
    }
    const tone =
      typeof obj.tone === 'string'
        ? obj.tone
        : obj.tone === null
          ? null
          : null;
    const savedAt =
      typeof obj.savedAt === 'string' && obj.savedAt.trim()
        ? obj.savedAt
        : new Date().toISOString();
    out.push({ body: obj.body, tone, savedAt });
  }
  return out;
}

function mapDraft(row: DraftRow): WritingDraft {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    tone: row.tone,
    versions: parseVersions(row.versions),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
