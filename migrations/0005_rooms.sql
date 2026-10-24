-- "Listen together" rooms. The live part (who is connected, what is playing) lives in a Durable Object per room;
-- this table only remembers that a room exists, who started it and when, so codes can be checked and expired.
CREATE TABLE rooms (
  code       TEXT PRIMARY KEY,
  host_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX rooms_host ON rooms(host_id);
