-- Initial database schema for laura (local dev).
-- We enable the pgvector extension because our "memories" store embeddings.

CREATE EXTENSION IF NOT EXISTS vector;

-- Keep the schema intentionally minimal for Step 3 (memory foundation).
-- We can add full user/conversation schemas later as the agent expands.

CREATE TABLE IF NOT EXISTS memories (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  content text NOT NULL,
  -- Vector dimension is fixed at 256 for this MVP.
  -- This must match the embedding dimension we request from Gemini.
  embedding vector(256) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- For correctness, we don't strictly need an index yet.
-- When performance becomes important, we'll add an ANN index (ivfflat/hnsw).

