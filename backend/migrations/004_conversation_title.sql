-- Optional display title for sidebar; when null, preview comes from first user message (existing behavior).
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS title text;
