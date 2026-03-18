import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { EmbeddingsService } from '../embeddings/embeddings.service';

type MemoryWriteInput = {
  userId: string;
  content: string;
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

    const embeddingValues = await this.embeddingsService.embedText(
      content,
      'RETRIEVAL_DOCUMENT'
    );
    console.log('embeddingValues', embeddingValues);
    const embeddingVectorLiteral = this.toVectorLiteral(embeddingValues);
    console.log('embeddingVectorLiteral', embeddingVectorLiteral);

    const res = await this.pool.query<{
      id: number;
    }>(
      `
      INSERT INTO memories (user_id, content, embedding)
      VALUES ($1, $2, $3::vector)
      RETURNING id;
      `,
      [input.userId, content, embeddingVectorLiteral]
    );

    return Number(res.rows[0]?.id);
  }

  async searchMemories(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const queryText = input.query.trim();
    if (!queryText) {
      throw new Error('query must not be empty');
    }

    const embeddingValues = await this.embeddingsService.embedText(
      queryText,
      'RETRIEVAL_QUERY'
    );
    console.log('embeddingValues-searchMemories', embeddingValues);
    const embeddingVectorLiteral = this.toVectorLiteral(embeddingValues);
    console.log('embeddingVectorLiteral-searchMemories', embeddingVectorLiteral);

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
      [embeddingVectorLiteral, input.userId, input.topK]
    );
    console.log('res-searchMemories', res);

    return res.rows.map((r) => ({
      id: Number(r.id),
      content: r.content,
      createdAt: r.created_at.toISOString(),
      distance: Number(r.distance),
    }));
  }

  private toVectorLiteral(values: number[]): string {
    // pgvector accepts a string literal like: '[0.1,0.2,...]'
    // Casting happens in SQL via `$3::vector` / `$1::vector`.
    // We also validate to keep debugging easier.
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('embedding values are missing');
    }

    return `[${values.join(',')}]`;
  }
}

