import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { DB_PATH, VAR_DIR } from "./paths";

// `node:sqlite` is a node:-only builtin that bundlers (Vite/Vitest) try to
// resolve as a bare package. Loading it via createRequire keeps it a plain
// runtime import that tooling leaves alone, while tsx/node resolve it natively.
const { DatabaseSync }: typeof import("node:sqlite") = createRequire(import.meta.url)("node:sqlite");

// `DB_FILE=:memory:` is used by tests; otherwise persist under server/var/.
const dbFile = process.env.DB_FILE ?? DB_PATH;
if (dbFile !== ":memory:") mkdirSync(VAR_DIR, { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/** Create tables if they don't exist. Safe to run repeatedly. */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS colors (
      code          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      names_json    TEXT NOT NULL,
      transparency  TEXT NOT NULL,
      pigments_json TEXT NOT NULL,
      lightfastness TEXT,
      iridescent    INTEGER NOT NULL DEFAULT 0,
      new           INTEGER NOT NULL DEFAULT 0,
      giant         INTEGER NOT NULL DEFAULT 0,
      hex           TEXT NOT NULL,
      swatch        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code       TEXT NOT NULL REFERENCES colors(code),
      quantity   INTEGER NOT NULL DEFAULT 0,
      level      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, code)
    );
  `);
}
