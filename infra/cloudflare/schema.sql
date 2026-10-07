-- Durable Telegram ingestion schema.
-- Apply to Cloudflare D1 only after the project resources are approved and created.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS intake_items (
  id TEXT PRIMARY KEY,
  telegram_update_id INTEGER NOT NULL UNIQUE,
  telegram_file_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('document', 'photo')),
  source_chat_id TEXT NOT NULL,
  source_message_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'queued', 'downloading', 'validating', 'quarantined', 'ocr_pending', 'draft', 'rights_review', 'approved', 'published', 'failed')),
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  storage_key TEXT,
  failure_code TEXT,
  failure_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS intake_items_file_idx
  ON intake_items (telegram_file_id);
CREATE INDEX IF NOT EXISTS intake_items_status_idx
  ON intake_items (status, next_retry_at, created_at);

CREATE TABLE IF NOT EXISTS rights_records (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL UNIQUE REFERENCES intake_items(id) ON DELETE CASCADE,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('missing', 'submitted', 'under_review', 'approved', 'rejected', 'expired')),
  rights_holder TEXT,
  evidence_note TEXT,
  evidence_storage_key TEXT,
  allowed_uses TEXT,
  expires_at TEXT,
  reviewer TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_drafts (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL UNIQUE REFERENCES intake_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  author TEXT,
  category TEXT,
  year TEXT,
  summary TEXT,
  reading_time INTEGER,
  cover_storage_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ocr_text_storage_key TEXT,
  page_count INTEGER,
  publication_status TEXT NOT NULL CHECK (publication_status IN ('draft', 'approved', 'published', 'unpublished')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS book_drafts_public_idx
  ON book_drafts (publication_status, updated_at);

CREATE TABLE IF NOT EXISTS ingestion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id TEXT NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ingestion_events_intake_idx
  ON ingestion_events (intake_id, created_at);
