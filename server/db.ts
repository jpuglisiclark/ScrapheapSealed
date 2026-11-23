import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Loaded via require so bundler-based test runners don't try to resolve the builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type DB = DatabaseSyncT;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS set_cache (
      code TEXT PRIMARY KEY,
      fetched_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      booster_type TEXT NOT NULL,
      pack_count INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cards TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      player_name TEXT NOT NULL,
      token TEXT NOT NULL,
      main TEXT NOT NULL DEFAULT '[]',
      basics TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      submitted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS decks_by_pool ON decks(pool_id);
  `);
  // Columns added after the first release.
  addColumn(db, 'pools', 'basic_lands', "TEXT NOT NULL DEFAULT '{}'");
  addColumn(db, 'decks', 'layout', 'TEXT');
  addColumn(db, 'decks', 'rating', 'INTEGER');
  return db;
}

function addColumn(db: DB, table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
