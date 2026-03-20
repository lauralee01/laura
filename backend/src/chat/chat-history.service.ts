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
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }

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

    const conversationId = conversationRes.rows[0]?.id;
    if (!conversationId) {
      return null;
    }

    const messages = await this.listMessages(conversationId, 100);
    return { conversationId, messages };
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
