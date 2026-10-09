-- Allow Telegram SoundCloud links to be stored as durable intake items.
-- Preserve existing file rows and references from rights_records.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE intake_items_new (
  id TEXT PRIMARY KEY,
  telegram_update_id INTEGER NOT NULL UNIQUE,
  telegram_file_id TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('document', 'photo', 'soundcloud_link')),
  source_chat_id TEXT NOT NULL,
  source_message_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'queued', 'downloading', 'validating', 'quarantined', 'ocr_pending', 'draft', 'rights_review', 'approved', 'published', 'failed')),
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  soundcloud_url TEXT,
  sha256 TEXT,
  storage_key TEXT,
  failure_code TEXT,
  failure_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (media_type = 'soundcloud_link' AND telegram_file_id IS NULL AND soundcloud_url IS NOT NULL)
    OR (media_type IN ('document', 'photo') AND telegram_file_id IS NOT NULL AND soundcloud_url IS NULL)
  )
);

INSERT INTO intake_items_new (
  id, telegram_update_id, telegram_file_id, media_type, source_chat_id, source_message_id,
  status, original_filename, mime_type, byte_size, sha256, storage_key, failure_code,
  failure_message, retry_count, next_retry_at, created_at, updated_at
)
SELECT
  id, telegram_update_id, telegram_file_id, media_type, source_chat_id, source_message_id,
  status, original_filename, mime_type, byte_size, sha256, storage_key, failure_code,
  failure_message, retry_count, next_retry_at, created_at, updated_at
FROM intake_items;

DROP TABLE intake_items;
ALTER TABLE intake_items_new RENAME TO intake_items;

CREATE UNIQUE INDEX intake_items_file_idx
  ON intake_items (telegram_file_id) WHERE telegram_file_id IS NOT NULL;
CREATE UNIQUE INDEX intake_items_soundcloud_url_idx
  ON intake_items (soundcloud_url) WHERE soundcloud_url IS NOT NULL;
CREATE INDEX intake_items_status_idx
  ON intake_items (status, next_retry_at, created_at);

COMMIT;
PRAGMA foreign_keys = ON;
