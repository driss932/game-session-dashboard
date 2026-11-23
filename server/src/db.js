// Database layer: opens SQLite and makes sure the schema exists.
//
// Why SQLite? It is a real SQL database (transactions, constraints, indexes)
// that needs no separate server, so a reviewer can run the project with
// `npm install && npm start`. The SQL below is plain ANSI-ish SQL, so moving
// to PostgreSQL in production is mostly a driver swap (see README "At scale").
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  game        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  video_url   TEXT,
  poster_url  TEXT,
  -- version increases on every change. Clients use it to ignore stale
  -- updates that arrive out of order (e.g. an old poll after a newer push).
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  photo_url   TEXT,
  UNIQUE (session_id, name)
);

-- Match history is listed newest-first and often filtered by status.
CREATE INDEX IF NOT EXISTS idx_sessions_status_started ON sessions (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions (started_at DESC);
-- Loading a session's players is the hottest query.
CREATE INDEX IF NOT EXISTS idx_players_session ON players (session_id);
`;

export function openDatabase(file = process.env.DB_FILE || 'data/game.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // WAL lets readers keep reading while a write is in progress.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
