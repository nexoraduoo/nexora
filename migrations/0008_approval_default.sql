-- From now on people ask first and the owner approves each one (invite links still let friends straight in).
-- The owner can change this any time: Owner console -> Who can join.
INSERT INTO settings (key, value) VALUES ('signup_mode', 'approval')
  ON CONFLICT(key) DO UPDATE SET value = 'approval';
