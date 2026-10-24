-- Catalogue v2: full-length music only, ranked by popularity and by release date.
ALTER TABLE tracks ADD COLUMN pop INTEGER NOT NULL DEFAULT 0;        -- plays / downloads / rank from the source
ALTER TABLE tracks ADD COLUMN released_at INTEGER;                   -- when the source says it came out (ms)
CREATE INDEX tracks_best ON tracks(verified, preview, source, pop DESC);
CREATE INDEX tracks_new  ON tracks(verified, preview, released_at DESC);
CREATE INDEX tracks_year ON tracks(verified, preview, year);
CREATE INDEX tracks_genre ON tracks(verified, preview, genre, pop DESC);
CREATE INDEX tracks_mood ON tracks(verified, preview, mood, pop DESC);

-- 30-second previews are no longer part of the verified catalogue
UPDATE tracks SET verified = 0 WHERE preview = 1;
