import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { LlmChatTurn } from '../llm/llm.service';

type StoredMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ConversationHistory = {
  conversationId: string;
  messages: StoredMessage[];
};

export type ConversationSummary = {
  id: string;
  updatedAt: string;
  preview: string;
};

@Injectable()
export class ChatHistoryService implements OnModuleDestroy {
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

  async getLatestConversation(sessionId: string): Promise<ConversationHistory | null> {
    return this.getConversationHistory(sessionId, undefined);
  }

  /**
   * Load messages for a session. If `conversationId` is set, that thread must belong to the session.
   * Otherwise returns the most recently updated conversation for the session.
   */
  async getConversationHistory(
    sessionId: string,
    conversationId?: string
  ): Promise<ConversationHistory | null> {
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }

    let resolvedId: string | undefined;

    const requested = (conversationId ?? '').trim();
    if (requested) {
      const check = await this.pool.query<{ id: string }>(
        `
        SELECT id
        FROM conversations
        WHERE id = $1 AND session_id = $2
        LIMIT 1;
        `,
        [requested, sid]
      );
      resolvedId = check.rows[0]?.id;
    } else {
      const conversationRes = await this.pool.query<{ id: string }>(
        `
        SELECT id
        FROM conversations
        WHERE session_id = $1
        ORDER BY updated_at DESC
        LIMIT 1;
        `,
        [sid]
      );
      resolvedId = conversationRes.rows[0]?.id;
    }

    if (!resolvedId) {
      return null;
    }

    const messages = await this.listMessages(resolvedId, 100);
    return { conversationId: resolvedId, messages };
  }

  async listConversations(sessionId: string): Promise<ConversationSummary[]> {
    const sid = sessionId.trim();
    if (!sid) {
      return [];
    }

    const res = await this.pool.query<{
      id: string;
      updated_at: Date;
      preview: string | null;
    }>(
      `
      SELECT
        c.id,
        c.updated_at,
        COALESCE(
          (
            SELECT LEFT(m.content, 72)
            FROM messages m
            WHERE m.conversation_id = c.id AND m.role = 'user'
            ORDER BY m.created_at ASC
            LIMIT 1
          ),
          'New chat'
        ) AS preview
      FROM conversations c
      WHERE c.session_id = $1
      ORDER BY c.updated_at DESC
      LIMIT 50;
      `,
      [sid]
    );

    return res.rows.map((row) => ({
      id: row.id,
      updatedAt: row.updated_at.toISOString(),
      preview: row.preview ?? 'New chat',
    }));
  }

  /** Creates an empty conversation row so the client can send the first message into a fresh thread. */
  async createEmptyConversation(sessionId: string): Promise<string | null> {
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }
    const newId = randomUUID();
    await this.pool.query(
      `
      INSERT INTO conversations (id, session_id)
      VALUES ($1, $2);
      `,
      [newId, sid]
    );
    return newId;
  }

  async ensureConversation(sessionId: string, conversationId?: string): Promise<string | null> {
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }

    const incomingId = (conversationId ?? '').trim();
    if (incomingId) {
      const existing = await this.pool.query<{ id: string }>(
        `
        SELECT id
        FROM conversations
        WHERE id = $1 AND session_id = $2
        LIMIT 1;
        `,
        [incomingId, sid]
      );
      if (existing.rows[0]?.id) {
        return incomingId;
      }
    }

    const latest = await this.getLatestConversation(sid);
    if (latest?.conversationId) {
      return latest.conversationId;
    }

    const newId = randomUUID();
    await this.pool.query(
      `
      INSERT INTO conversations (id, session_id)
      VALUES ($1, $2);
      `,
      [newId, sid]
    );
    return newId;
  }

  async appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const cid = conversationId.trim();
    const trimmed = content.trim();
    if (!cid || !trimmed) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO messages (conversation_id, role, content)
      VALUES ($1, $2, $3);
      `,
      [cid, role, trimmed]
    );

    await this.pool.query(
      `
      UPDATE conversations
      SET updated_at = now()
      WHERE id = $1;
      `,
      [cid]
    );
  }

  async listMessages(conversationId: string, limit: number): Promise<StoredMessage[]> {
    const capped = Math.max(1, Math.min(limit, 200));
    const res = await this.pool.query<{
      role: 'user' | 'assistant';
      content: string;
      created_at: Date;
    }>(
      `
      SELECT role, content, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT $2;
      `,
      [conversationId, capped]
    );

    return res.rows.map((row) => ({
      role: row.role,
      content: row.content,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listTurnsForLlm(conversationId: string): Promise<LlmChatTurn[]> {
    const messages = await this.listMessages(conversationId, 100);
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }
}
