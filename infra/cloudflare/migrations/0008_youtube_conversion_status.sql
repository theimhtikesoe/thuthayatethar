-- Track asynchronous YouTube-to-audio conversion jobs.
ALTER TABLE book_drafts ADD COLUMN youtube_audio_status TEXT;
ALTER TABLE book_drafts ADD COLUMN youtube_audio_error TEXT;
CREATE INDEX IF NOT EXISTS book_drafts_youtube_audio_status_idx ON book_drafts (youtube_audio_status);
