import { beforeAll, describe, expect, it } from "vitest";

// In-memory DB; must be set before importing modules that open the connection.
process.env.DB_FILE = ":memory:";

const { db, migrate } = await import("./db");
const { seed } = await import("./seed");

/**
 * The production DB predates catalogues: user tables keyed on the bare
 * Sennelier code. Recreate that v0 schema with live-looking data and verify
 * migrate() carries everything over to color_id keys.
 */
describe("v0 → v1 migration", () => {
  beforeAll(() => {
    db.exec(`
      CREATE TABLE colors (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, names_json TEXT NOT NULL,
        transparency TEXT NOT NULL, pigments_json TEXT NOT NULL, lightfastness TEXT,
        iridescent INTEGER NOT NULL DEFAULT 0, new INTEGER NOT NULL DEFAULT 0,
        giant INTEGER NOT NULL DEFAULT 0, hex TEXT NOT NULL, swatch TEXT NOT NULL
      );
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      CREATE TABLE inventory (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL REFERENCES colors(code),
        quantity INTEGER NOT NULL DEFAULT 0, level TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, code)
      );
      CREATE TABLE color_meta (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL REFERENCES colors(code),
        favorite INTEGER NOT NULL DEFAULT 0, want INTEGER NOT NULL DEFAULT 0,
        notes TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, code)
      );
      CREATE TABLE inventory_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL REFERENCES colors(code),
        type TEXT NOT NULL, amount INTEGER, level TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_events_user_code ON inventory_events (user_id, code, id);

      INSERT INTO colors VALUES ('038','Vermilion','{}','T','[]','I',0,0,0,'#E8503E','swatches/038.png');
      INSERT INTO users (username, password_hash) VALUES ('jaakko','x');
      INSERT INTO inventory (user_id, code, quantity, level) VALUES (1,'038',2,'half');
      INSERT INTO color_meta (user_id, code, favorite, want, notes) VALUES (1,'038',1,0,'love this');
      INSERT INTO inventory_events (user_id, code, type, amount) VALUES (1,'038','add',2);
    `);
  });

  it("rekeys user data to color_id and survives a reseed", () => {
    migrate();

    const inv = db.prepare("SELECT * FROM inventory").all() as Array<Record<string, unknown>>;
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ color_id: "sennelier-038", quantity: 2, level: "half" });

    const meta = db.prepare("SELECT * FROM color_meta").all() as Array<Record<string, unknown>>;
    expect(meta[0]).toMatchObject({ color_id: "sennelier-038", favorite: 1, notes: "love this" });

    const events = db.prepare("SELECT * FROM inventory_events").all() as Array<
      Record<string, unknown>
    >;
    expect(events[0]).toMatchObject({ id: 1, color_id: "sennelier-038", type: "add", amount: 2 });

    // The colors table was rebuilt empty (catalogue data, reseeded on boot).
    expect(db.prepare("SELECT COUNT(*) AS n FROM colors").get()).toMatchObject({ n: 0 });
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });

    // Running migrate again is a no-op…
    migrate();
    // …and seeding restores the catalogue so the FK targets exist again.
    const n = seed();
    expect(n).toBeGreaterThanOrEqual(120);
    const joined = db
      .prepare(
        `SELECT c.name, i.quantity FROM inventory i JOIN colors c ON c.id = i.color_id WHERE i.user_id = 1`,
      )
      .get() as { name: string; quantity: number };
    expect(joined).toMatchObject({ name: "Vermilion", quantity: 2 });
  });
});
