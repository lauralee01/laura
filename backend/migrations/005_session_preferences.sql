-- Per-session user preferences.
-- We currently only store the IANA timezone used for scheduling.

CREATE TABLE IF NOT EXISTS session_preferences (
  session_id text PRIMARY KEY,
  timezone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

