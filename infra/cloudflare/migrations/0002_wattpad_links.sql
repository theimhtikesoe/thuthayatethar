-- Store approved external Wattpad links without copying story text.
ALTER TABLE intake_items ADD COLUMN source_type TEXT NOT NULL DEFAULT 'telegram_media';
ALTER TABLE intake_items ADD COLUMN source_url TEXT;
CREATE INDEX IF NOT EXISTS intake_items_source_type_idx ON intake_items (source_type, created_at);
