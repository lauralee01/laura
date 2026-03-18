import { Injectable } from '@nestjs/common';

type EmbeddingTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING';

type GeminiEmbedResponse = {
  embedding?: {
    values?: number[];
  };
};

@Injectable()
export class EmbeddingsService {
  private getApiKey(): string {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing (set backend/.env)');
    }
    return key;
  }

  private getModelId(): string {
    // Gemini embedding model id without the leading `models/` prefix.
    return process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
  }

  private getOutputDimensionality(): number {
    // Must match the pgvector column dimensionality we created (currently 256).
    const raw = process.env.GEMINI_EMBEDDING_DIMENSION?.trim();
    const parsed = raw ? Number(raw) : 256;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('GEMINI_EMBEDDING_DIMENSION must be a positive number');
    }
    return parsed;
  }

  async embedText(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
    const apiKey = this.getApiKey();
    const modelId = this.getModelId();
    const outputDim = this.getOutputDimensionality();

    // Gemini REST endpoint: URL uses `<modelId>` while the JSON payload uses `models/<modelId>`.
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelId) +
      ':embedContent?key=' +
      encodeURIComponent(apiKey);

    const payload = {
      model: `models/${modelId}`,
      content: {
        parts: [{ text }],
      },
      task_type: taskType,
      // Keep embeddings small so our `vector(256)` column stays consistent.
      output_dimensionality: outputDim,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => '');
      throw new Error(
        `Gemini embeddings error (${res.status}). ${
          details ? 'Details: ' + details : ''
        }`
      );
    }

    const jsonUnknown: unknown = await res.json();
    if (typeof jsonUnknown !== 'object' || jsonUnknown === null) {
      throw new Error('Gemini embeddings returned an unexpected response shape');
    }

    const json = jsonUnknown as GeminiEmbedResponse;
    const values = json.embedding?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error('Gemini embeddings response did not include embedding values');
    }

    return values;
  }
}

