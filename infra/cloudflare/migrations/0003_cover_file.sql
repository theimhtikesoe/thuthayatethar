-- Keep the Telegram document thumbnail as a private cover asset when available.
ALTER TABLE intake_items ADD COLUMN cover_telegram_file_id TEXT;
