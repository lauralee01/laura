-- Structured session prefs: reply tone + default calendar event duration.
ALTER TABLE session_preferences
  ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT 'warm',
  ADD COLUMN IF NOT EXISTS default_meeting_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE session_preferences
  DROP CONSTRAINT IF EXISTS session_preferences_tone_check;

ALTER TABLE session_preferences
  ADD CONSTRAINT session_preferences_tone_check
  CHECK (tone IN ('warm', 'concise', 'casual'));

ALTER TABLE session_preferences
  DROP CONSTRAINT IF EXISTS session_preferences_meeting_minutes_check;

ALTER TABLE session_preferences
  ADD CONSTRAINT session_preferences_meeting_minutes_check
  CHECK (
    default_meeting_minutes >= 15
    AND default_meeting_minutes <= 180
  );
