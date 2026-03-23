-- Google OAuth (Phase 4): CSRF state + stored tokens per browser session.
-- `session_id` matches the frontend `laura_session_id` until we add real user accounts.

CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
  ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  session_id text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text,
  token_type text NOT NULL DEFAULT 'Bearer',
  scope text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
