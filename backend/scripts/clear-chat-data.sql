-- Clear all chat threads and messages. Safe to re-run.
--
-- From repo root:  psql "$DATABASE_URL" -f backend/scripts/clear-chat-data.sql
-- From backend/:    psql "$DATABASE_URL" -f scripts/clear-chat-data.sql
-- Or paste into Supabase / Neon SQL editor.

-- `messages` references `conversations`; CASCADE truncates dependent rows too.
-- RESTART IDENTITY resets the messages id sequence (bigserial).
TRUNCATE conversations RESTART IDENTITY CASCADE;

-- --- Optional: full anonymous-session cleanup (uncomment if you want a totally empty slate) ---
-- TRUNCATE memories RESTART IDENTITY;
-- DELETE FROM oauth_states;
-- DELETE FROM google_oauth_tokens;
-- DELETE FROM session_preferences;
