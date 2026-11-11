import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { EmbeddingsService } from '../embeddings/embeddings.service';

type MemoryWriteInput = {
  userId: string;
  content: string;
  /** When set, skips a second embedContent call (dedupe + insert share one vector). */
  embedding?: number[];
};

type MemorySearchInput = {
  userId: string;
  query: string;
  topK: number;
};

type MemorySearchResult = {
  id: number;
  content: string;
  createdAt: string;
  distance: number;
};

export type MemoryListItem = {
  id: number;
  content: string;
  createdAt: string;
};

type WriteMemoryIfNovelInput = {
  userId: string;
  content: string;
  /** Cosine distance; nearer than this counts as duplicate. Default 0.12. */
  dedupeDistanceThreshold?: number;
};

export type WriteMemoryIfNovelResult =
  | { status: 'written'; id: number }
  | { status: 'duplicate'; distance: number }
  | { status: 'empty' };

@Injectable()
export class MemoryService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly embeddingsService: EmbeddingsService) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing. Set it in backend/.env');
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  async writeMemory(input: MemoryWriteInput): Promise<number> {
    const content = input.content.trim();
    if (!content) {
      throw new Error('content must not be empty');
    }

    const embeddingValues =
      input.embedding ??
      (await this.embeddingsService.embedText(content, 'RETRIEVAL_DOCUMENT'));
    return this.insertMemory(input.userId, content, embeddingValues);
  }

  /**
   * Embed once as a document vector, near-dupe check against stored memories,
   * then insert with the same vector — avoids the old query-embed + doc-embed pair.
   */
  async writeMemoryIfNovel(
    input: WriteMemoryIfNovelInput,
  ): Promise<WriteMemoryIfNovelResult> {
    const content = input.content.trim();
    if (!content) {
      return { status: 'empty' };
    }

    const threshold =
      input.dedupeDistanceThreshold ??
      this.getDedupeDistanceThreshold();

    const embedding = await this.embeddingsService.embedText(
      content,
      'RETRIEVAL_DOCUMENT',
    );

    const nearest = await this.searchByEmbedding({
      userId: input.userId,
      embedding,
      topK: 1,
    });

    if (nearest.length > 0 && nearest[0].distance <= threshold) {
      return { status: 'duplicate', distance: nearest[0].distance };
    }

    const id = await this.insertMemory(input.userId, content, embedding);
    return { status: 'written', id };
  }

  async listMemories(userId: string): Promise<MemoryListItem[]> {
    const sid = userId.trim();
    if (!sid) {
      return [];
    }

    const res = await this.pool.query<{
      id: number;
      content: string;
      created_at: Date;
    }>(
      `
      SELECT id, content, created_at
      FROM memories
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC;
      `,
      [sid],
    );

    return res.rows.map((r) => ({
      id: Number(r.id),
      content: r.content,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async updateMemory(
    userId: string,
    id: number,
    content: string,
  ): Promise<MemoryListItem | null> {
    const sid = userId.trim();
    const trimmed = content.trim();
    if (!sid || !Number.isFinite(id) || id <= 0) {
      return null;
    }
    if (!trimmed) {
      throw new Error('content must not be empty');
    }

    const embeddingValues = await this.embeddingsService.embedText(
      trimmed,
      'RETRIEVAL_DOCUMENT',
    );
    const embeddingVectorLiteral = this.toVectorLiteral(embeddingValues);

    const res = await this.pool.query<{
      id: number;
      content: string;
      created_at: Date;
    }>(
      `
      UPDATE memories
      SET content = $3, embedding = $4::vector
      WHERE id = $1 AND user_id = $2
      RETURNING id, content, created_at;
      `,
      [id, sid, trimmed, embeddingVectorLiteral],
    );

    const row = res.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      content: row.content,
      createdAt: row.created_at.toISOString(),
    };
  }

  async deleteMemory(userId: string, id: number): Promise<boolean> {
    const sid = userId.trim();
    if (!sid || !Number.isFinite(id) || id <= 0) {
      return false;
    }

    const res = await this.pool.query(
      `
      DELETE FROM memories
      WHERE id = $1 AND user_id = $2;
      `,
      [id, sid],
    );

    return (res.rowCount ?? 0) > 0;
  }

  async searchMemories(
    input: MemorySearchInput,
  ): Promise<MemorySearchResult[]> {
    const queryText = input.query.trim();
    if (!queryText) {
      throw new Error('query must not be empty');
    }

    const embeddingValues = await this.embeddingsService.embedText(
      queryText,
      'RETRIEVAL_QUERY',
    );

    return this.searchByEmbedding({
      userId: input.userId,
      embedding: embeddingValues,
      topK: input.topK,
    });
  }

  async searchByEmbedding(input: {
    userId: string;
    embedding: number[];
    topK: number;
  }): Promise<MemorySearchResult[]> {
    const embeddingVectorLiteral = this.toVectorLiteral(input.embedding);

    const res = await this.pool.query<{
      id: number;
      content: string;
      created_at: Date;
      distance: number;
    }>(
      `
      SELECT
        id,
        content,
        created_at,
        (embedding <=> $1::vector) AS distance
      FROM memories
      WHERE user_id = $2
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3;
      `,
      [embeddingVectorLiteral, input.userId, input.topK],
    );

    return res.rows.map((r) => ({
      id: Number(r.id),
      content: r.content,
      createdAt: r.created_at.toISOString(),
      distance: Number(r.distance),
    }));
  }

  private async insertMemory(
    userId: string,
    content: string,
    embeddingValues: number[],
  ): Promise<number> {
    const embeddingVectorLiteral = this.toVectorLiteral(embeddingValues);

    const res = await this.pool.query<{
      id: number;
    }>(
      `
      INSERT INTO memories (user_id, content, embedding)
      VALUES ($1, $2, $3::vector)
      RETURNING id;
      `,
      [userId, content, embeddingVectorLiteral],
    );

    return Number(res.rows[0]?.id);
  }

  private getDedupeDistanceThreshold(): number {
    const thresholdRaw = process.env.MEMORY_DEDUPE_DISTANCE_THRESHOLD?.trim();
    const threshold = thresholdRaw ? Number(thresholdRaw) : 0.12;

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('MEMORY_DEDUPE_DISTANCE_THRESHOLD must be >= 0');
    }

    return threshold;
  }

  private toVectorLiteral(values: number[]): string {
    // pgvector accepts a string literal like: '[0.1,0.2,...]'
    // Casting happens in SQL via `$3::vector` / `$1::vector`.
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('embedding values are missing');
    }

    return `[${values.join(',')}]`;
  }
}
