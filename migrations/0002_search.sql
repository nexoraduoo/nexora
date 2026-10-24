-- Full-text search over the catalogue (kept separate so it can be skipped if a
-- platform ever lacks FTS5; the API falls back to LIKE queries).
CREATE VIRTUAL TABLE tracks_fts USING fts5(title, artist, album, content='tracks', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');

CREATE TRIGGER tracks_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album) VALUES (new.rowid, new.title, new.artist, new.album);
END;
CREATE TRIGGER tracks_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album) VALUES ('delete', old.rowid, old.title, old.artist, old.album);
END;
CREATE TRIGGER tracks_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album) VALUES ('delete', old.rowid, old.title, old.artist, old.album);
  INSERT INTO tracks_fts(rowid, title, artist, album) VALUES (new.rowid, new.title, new.artist, new.album);
END;
