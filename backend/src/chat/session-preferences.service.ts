import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { IANAZone } from 'luxon';
import {
  emptyPendingDocument,
  parsePendingDocument,
  type LastEmailDraft,
  type SessionPendingDocument,
  type ToolPendingMap,
  type WebSearchMissingLocationPending,
} from './session-pending.types';

/** One-row chat bootstrap from `session_preferences`. */
export type ChatSessionBootstrap = {
  timeZone: string | null;
  location: string | null;
  webSearch: WebSearchMissingLocationPending | null;
  tools: ToolPendingMap;
};

@Injectable()
export class SessionPreferencesService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing. Set it in backend/.env');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Single SELECT for chat replyTo bootstrap (tz + location + pending JSON).
   * Avoids the old 3–4 round-trips on the same row.
   */
  async getChatBootstrap(sessionId: string): Promise<ChatSessionBootstrap> {
    const sid = (sessionId ?? '').trim();
    if (!sid) {
      return {
        timeZone: null,
        location: null,
        webSearch: null,
        tools: {},
      };
    }

    const res = await this.pool.query<{
      timezone: string | null;
      location: string | null;
      pending_action: unknown;
    }>(
      `
      SELECT timezone, location, pending_action
      FROM session_preferences
      WHERE session_id = $1
      LIMIT 1;
      `,
      [sid],
    );

    const row = res.rows[0];
    if (!row) {
      return {
        timeZone: null,
        location: null,
        webSearch: null,
        tools: {},
      };
    }

    const doc = parsePendingDocument(row.pending_action ?? null);
    return {
      timeZone: row.timezone ?? null,
      location: row.location ?? null,
      webSearch: doc.webSearch ?? null,
      tools: { ...(doc.tools ?? {}) },
    };
  }

  private async readPendingDocument(
    sessionId: string,
  ): Promise<SessionPendingDocument> {
    const sid = sessionId.trim();
    if (!sid) return emptyPendingDocument();

    const res = await this.pool.query<{ pending_action: unknown }>(
      `
      SELECT pending_action
      FROM session_preferences
      WHERE session_id = $1
      LIMIT 1;
      `,
      [sid],
    );

    return parsePendingDocument(res.rows[0]?.pending_action ?? null);
  }

  private async writePendingDocument(
    sessionId: string,
    doc: SessionPendingDocument,
  ): Promise<void> {
    const sid = sessionId.trim();
    if (!sid) return;

    const hasWebSearch = Boolean(doc.webSearch);
    const hasTools = Boolean(doc.tools && Object.keys(doc.tools).length > 0);
    const hasLastEmailDraft = Boolean(doc.lastEmailDraft?.draftId);
    const value =
      hasWebSearch || hasTools || hasLastEmailDraft ? doc : null;

    await this.pool.query(
      `
      INSERT INTO session_preferences (session_id, pending_action, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET
        pending_action = EXCLUDED.pending_action,
        updated_at = NOW();
      `,
      [sid, value ? JSON.stringify(value) : null],
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  async getTimeZone(sessionId: string): Promise<string | null> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return null;

    const res = await this.pool.query<{ timezone: string | null }>(
      `
      SELECT timezone
      FROM session_preferences
      WHERE session_id = $1
      LIMIT 1;
      `,
      [sid],
    );

    return res.rows[0]?.timezone ?? null;
  }

  async setTimeZone(sessionId: string, timeZone: string): Promise<void> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return;

    const tz = (timeZone ?? '').trim();
    if (!tz) {
      throw new BadRequestException('timeZone must not be empty');
    }

    // Validate to ensure later Luxon conversions won’t fail.
    // Luxon treats IANA names and (usually) "UTC" as valid zones.
    if (!IANAZone.isValidZone(tz)) {
      throw new BadRequestException(
        `Invalid timezone. Please use an IANA timezone like America/Chicago.`,
      );
    }

    await this.pool.query(
      `
      INSERT INTO session_preferences (session_id, timezone)
      VALUES ($1, $2)
      ON CONFLICT (session_id)
      DO UPDATE SET timezone = EXCLUDED.timezone, updated_at = now();
      `,
      [sid, tz],
    );
  }

  async getLocation(sessionId: string): Promise<string | null> {
    const sid = (sessionId ?? '').trim();
    if (!sid) return null;

    const res = await this.pool.query<{ location: string | null }>(
      `
    SELECT location
    FROM session_preferences
    WHERE session_id = $1
    LIMIT 1;
    `,
      [sid],
    );

    return res.rows[0]?.location ?? null;
  }

  async setLocation(sessionId: string, location: string): Promise<void> {
    const sid = sessionId.trim();
    const loc = location.trim();

    if (!sid || !loc) return;

    await this.pool.query(
      `
    INSERT INTO session_preferences (session_id, location, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (session_id)
    DO UPDATE SET
      location = EXCLUDED.location,
      updated_at = NOW();
    `,
      [sid, loc],
    );
  }

  async setPendingAction(
    sessionId: string,
    pendingAction: WebSearchMissingLocationPending,
  ): Promise<void> {
    const doc = await this.readPendingDocument(sessionId);
    doc.webSearch = pendingAction;
    await this.writePendingDocument(sessionId, doc);
  }

  async getPendingAction(
    sessionId: string,
  ): Promise<WebSearchMissingLocationPending | null> {
    const doc = await this.readPendingDocument(sessionId);
    return doc.webSearch ?? null;
  }

  async clearPendingAction(sessionId: string): Promise<void> {
    const doc = await this.readPendingDocument(sessionId);
    doc.webSearch = null;
    await this.writePendingDocument(sessionId, doc);
  }

  async getToolPendingMap(sessionId: string): Promise<ToolPendingMap> {
    const doc = await this.readPendingDocument(sessionId);
    return { ...(doc.tools ?? {}) };
  }

  async saveToolPendingMap(
    sessionId: string,
    tools: ToolPendingMap,
  ): Promise<void> {
    const doc = await this.readPendingDocument(sessionId);
    doc.tools = tools;
    await this.writePendingDocument(sessionId, doc);
  }

  async getLastEmailDraft(
    sessionId: string,
  ): Promise<LastEmailDraft | null> {
    const doc = await this.readPendingDocument(sessionId);
    return doc.lastEmailDraft ?? null;
  }

  async setLastEmailDraft(
    sessionId: string,
    draft: Omit<LastEmailDraft, 'updatedAt'> & { updatedAt?: number },
  ): Promise<void> {
    const sid = sessionId.trim();
    const draftId = draft.draftId?.trim();
    if (!sid || !draftId) return;

    const doc = await this.readPendingDocument(sid);
    doc.lastEmailDraft = {
      draftId,
      recipients: draft.recipients ?? [],
      subject: draft.subject ?? '',
      body: draft.body ?? '',
      updatedAt: draft.updatedAt ?? Date.now(),
    };
    await this.writePendingDocument(sid, doc);
  }

  async clearLastEmailDraft(sessionId: string): Promise<void> {
    const sid = sessionId.trim();
    if (!sid) return;
    const doc = await this.readPendingDocument(sid);
    if (!doc.lastEmailDraft) return;
    doc.lastEmailDraft = null;
    await this.writePendingDocument(sid, doc);
  }
}


