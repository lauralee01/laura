-- Step 3 refinement: store `user_id` as a UUID-like string instead of bigint.
-- Our migration runner replays migrations every time, so this must be idempotent.

DO $$
BEGIN
  -- Only alter if the current user_id type is bigint.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'memories'
      AND column_name = 'user_id'
      AND data_type = 'bigint'
  ) THEN
    ALTER TABLE memories
      ALTER COLUMN user_id TYPE text
      USING user_id::text;
  END IF;
END $$;

