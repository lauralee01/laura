-- Writing desk (#24): durable writing artifacts with optional version history.
CREATE TABLE IF NOT EXISTS writing_drafts (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  tone text,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writing_drafts_session_updated
  ON writing_drafts (session_id, updated_at DESC);
