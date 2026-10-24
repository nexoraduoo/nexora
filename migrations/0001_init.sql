-- Nexora database schema (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name   TEXT NOT NULL,
  pw_hash        TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member',      -- 'admin' | 'member'
  hue            INTEGER NOT NULL DEFAULT 260,        -- avatar colour
  prefs          TEXT NOT NULL DEFAULT '{}',          -- JSON: language, eq, crossfade...
  share_activity INTEGER NOT NULL DEFAULT 1,
  now_playing    TEXT,                                -- JSON track snapshot
  now_playing_at INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE TABLE devices (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'desktop',         -- phone | tablet | desktop | tv | watch
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE INDEX devices_user ON devices(user_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Catalogue + metadata cache. Every track that is liked, queued in a playlist or
-- ingested by the agent is stored here as a snapshot so it survives source changes.
CREATE TABLE tracks (
  id           TEXT PRIMARY KEY,                      -- "<source>:<sourceId>"
  source       TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'track',         -- track | radio
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL DEFAULT '',
  album        TEXT NOT NULL DEFAULT '',
  duration     INTEGER NOT NULL DEFAULT 0,            -- seconds
  artwork      TEXT,
  url          TEXT,                                  -- direct stream url (may be resolved later)
  preview      INTEGER NOT NULL DEFAULT 0,            -- 1 = 30s preview only
  license      TEXT,
  downloadable INTEGER NOT NULL DEFAULT 0,
  lang         TEXT,                                  -- ISO 639-1
  genre        TEXT,
  mood         TEXT,
  year         INTEGER,
  ext          TEXT,                                  -- link to the original page
  verified     INTEGER NOT NULL DEFAULT 0,            -- passed the catalogue agent's checks
  dead         INTEGER NOT NULL DEFAULT 0,
  norm_key     TEXT,
  meta         TEXT NOT NULL DEFAULT '{}',            -- JSON: albumId, artistId, fullDuration, explicit...
  added_at     INTEGER NOT NULL
);
CREATE INDEX tracks_source ON tracks(source, added_at DESC);
CREATE INDEX tracks_lang ON tracks(lang, verified);
CREATE INDEX tracks_norm ON tracks(norm_key);

CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE playlists (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_public   INTEGER NOT NULL DEFAULT 0,
  collab      INTEGER NOT NULL DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX playlists_owner ON playlists(owner_id);

CREATE TABLE playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  pos         REAL NOT NULL,
  added_by    TEXT,
  added_at    INTEGER NOT NULL
);
CREATE INDEX playlist_tracks_pl ON playlist_tracks(playlist_id, pos);

-- Saved albums / artists / radio stations / playlists from others
CREATE TABLE library_items (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                           -- album | artist | station | playlist
  ref        TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);

CREATE TABLE history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id  TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at INTEGER NOT NULL,
  ms        INTEGER NOT NULL DEFAULT 0,
  device_id TEXT
);
CREATE INDEX history_user ON history(user_id, played_at DESC);

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

-- Files a user uploaded to their private cloud locker (requires R2)
CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL,
  filename   TEXT NOT NULL,
  size       INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  track_id   TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX uploads_user ON uploads(user_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE ingest_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  task        TEXT NOT NULL,
  fetched     INTEGER NOT NULL DEFAULT 0,
  accepted    INTEGER NOT NULL DEFAULT 0,
  rejected    INTEGER NOT NULL DEFAULT 0,
  note        TEXT
);

CREATE TABLE rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
