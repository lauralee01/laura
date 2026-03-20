CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session_id
  ON conversations (session_id);

CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON messages (conversation_id, created_at);
