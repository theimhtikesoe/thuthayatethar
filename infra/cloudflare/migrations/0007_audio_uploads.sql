-- Store uploaded audiobook media separately from PDF storage.
ALTER TABLE book_drafts ADD COLUMN audio_storage_key TEXT;
ALTER TABLE book_drafts ADD COLUMN audio_mime_type TEXT;
ALTER TABLE book_drafts ADD COLUMN audio_byte_size INTEGER;
CREATE INDEX IF NOT EXISTS book_drafts_audio_idx ON book_drafts (audio_storage_key);
