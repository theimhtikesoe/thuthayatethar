-- Add first-class YouTube audiobook links alongside SoundCloud links.
ALTER TABLE book_drafts ADD COLUMN youtube_url TEXT;

CREATE INDEX IF NOT EXISTS book_drafts_youtube_idx ON book_drafts (youtube_url);
