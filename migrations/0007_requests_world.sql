-- Sign-in requests: anyone can ask for an account; nothing works until the owner approves ("tickets").
CREATE TABLE signup_requests (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pw_hash      TEXT NOT NULL,                 -- same scrambled-password format as users.pw_hash
  message      TEXT NOT NULL DEFAULT '',      -- "Hi, it's Ravi from college"
  hue          INTEGER NOT NULL DEFAULT 260,
  created_at   INTEGER NOT NULL
);

-- The world catalogue: every release the open music databases (MusicBrainz / ListenBrainz) know about, newest first.
CREATE TABLE world_releases (
  mbid         TEXT PRIMARY KEY,              -- MusicBrainz release id
  group_mbid   TEXT,
  name         TEXT NOT NULL,
  artist       TEXT NOT NULL,
  release_date TEXT,                          -- YYYY-MM-DD
  kind         TEXT,                          -- Album | Single | EP ...
  caa_mbid     TEXT,                          -- release id that has the cover art
  listens      INTEGER NOT NULL DEFAULT 0,    -- how many ListenBrainz listeners played it (a "is it big?" signal)
  added_at     INTEGER NOT NULL
);
CREATE INDEX world_releases_date ON world_releases(release_date DESC, added_at DESC);

-- Short-lived copies of answers from MusicBrainz so we stay inside their 1-request-per-second rule
CREATE TABLE world_cache (
  key  TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  at   INTEGER NOT NULL
);
