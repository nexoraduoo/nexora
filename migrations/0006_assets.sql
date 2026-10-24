-- Recordings keep one permanent identity (the ISRC, when the source knows it) and a revision number.
-- When the audio behind a track is replaced (a remaster, a fixed mix), the id and ISRC stay the same and `rev` goes up,
-- so playlists, likes and history stay intact while devices know their saved copy is old.
ALTER TABLE tracks ADD COLUMN isrc TEXT;                              -- 12-character International Standard Recording Code
ALTER TABLE tracks ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;         -- audio revision: +1 each time the audio is replaced
ALTER TABLE tracks ADD COLUMN asset_at INTEGER;                       -- when the audio was last replaced (ms)
CREATE INDEX tracks_isrc ON tracks(isrc) WHERE isrc IS NOT NULL;

-- Every asset change, newest first in the owner console (our small version of a DDEX delivery log)
CREATE TABLE asset_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       INTEGER NOT NULL,
  action   TEXT NOT NULL,          -- UpdateAsset | UpdateMetadata | TakeDown | AutoUpdate
  track_id TEXT NOT NULL,
  isrc     TEXT,
  rev      INTEGER,
  detail   TEXT,
  by_user  TEXT
);
CREATE INDEX asset_log_at ON asset_log(at DESC);
