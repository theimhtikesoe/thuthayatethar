ALTER TABLE book_drafts ADD COLUMN youtube_audio_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE book_drafts ADD COLUMN youtube_audio_next_retry_at TEXT;
CREATE INDEX IF NOT EXISTS book_drafts_youtube_retry_idx ON book_drafts (youtube_audio_status, youtube_audio_next_retry_at);
