-- Remembers which official YouTube video matches which track, so each song costs the
-- (free, limited) YouTube search quota only once. video_id = '' means "looked, nothing good found".
CREATE TABLE yt_map (
  track_id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  title    TEXT,
  channel  TEXT,
  at       INTEGER NOT NULL
);
