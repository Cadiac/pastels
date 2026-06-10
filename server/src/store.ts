import type {
  CatalogueInfo,
  ColorMetaInput,
  ColorWithInventory,
  HistoryEvent,
  Level,
} from "shared";
import { db } from "./db";

interface ColorRow {
  id: string;
  catalogue: string;
  code: string;
  name: string;
  names_json: string;
  transparency: string | null;
  pigments_json: string;
  lightfastness: string | null;
  iridescent: number;
  new: number;
  giant: number;
  hex: string;
  swatch: string;
  quantity: number | null;
  level: string | null;
  favorite: number | null;
  want: number | null;
  notes: string | null;
}

function mapRow(r: ColorRow): ColorWithInventory {
  return {
    id: r.id,
    catalogue: r.catalogue,
    code: r.code,
    name: r.name,
    names: JSON.parse(r.names_json),
    transparency: r.transparency as ColorWithInventory["transparency"],
    pigments: JSON.parse(r.pigments_json),
    lightfastness: r.lightfastness,
    iridescent: !!r.iridescent,
    new: !!r.new,
    giant: !!r.giant,
    hex: r.hex,
    // Swatches live at data/<catalogue>/swatches/<code>.png; the app serves
    // them under this URL regardless of what the data file stored.
    swatch: `/swatches/${r.catalogue}/${r.code}.png`,
    inventory:
      r.quantity != null && r.quantity > 0
        ? { quantity: r.quantity, level: (r.level as Level | null) ?? null }
        : null,
    favorite: !!r.favorite,
    want: !!r.want,
    notes: r.notes ?? null,
  };
}

const SELECT = `
  SELECT c.*, i.quantity AS quantity, i.level AS level,
         m.favorite AS favorite, m.want AS want, m.notes AS notes
  FROM colors c
  LEFT JOIN inventory i ON i.color_id = c.id AND i.user_id = @userId
  LEFT JOIN color_meta m ON m.color_id = c.id AND m.user_id = @userId
`;

export function getColorsForUser(userId: number, catalogue?: string): ColorWithInventory[] {
  const rows = (
    catalogue
      ? db
          .prepare(`${SELECT} WHERE c.catalogue = @catalogue ORDER BY c.code`)
          .all({ userId, catalogue })
      : db.prepare(`${SELECT} ORDER BY c.catalogue, c.code`).all({ userId })
  ) as unknown as ColorRow[];
  return rows.map(mapRow);
}

export function getColorForUser(userId: number, id: string): ColorWithInventory | null {
  const row = db.prepare(`${SELECT} WHERE c.id = @id`).get({ userId, id }) as unknown as
    | ColorRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function getCataloguesForUser(userId: number): CatalogueInfo[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.brand, g.name, g.short_name AS shortName,
              COUNT(c.id) AS total,
              COUNT(i.color_id) AS owned
       FROM catalogues g
       LEFT JOIN colors c ON c.catalogue = g.id
       LEFT JOIN inventory i ON i.color_id = c.id AND i.user_id = ? AND i.quantity > 0
       GROUP BY g.id
       ORDER BY g.position, g.id`,
    )
    .all(userId) as unknown as CatalogueInfo[];
  return rows;
}

export function setInventory(
  userId: number,
  colorId: string,
  quantity: number,
  level: Level | null,
): void {
  if (quantity <= 0) {
    db.prepare("DELETE FROM inventory WHERE user_id = ? AND color_id = ?").run(userId, colorId);
    return;
  }
  db.prepare(
    `INSERT INTO inventory (user_id, color_id, quantity, level, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, color_id) DO UPDATE SET
       quantity = excluded.quantity, level = excluded.level, updated_at = datetime('now')`,
  ).run(userId, colorId, quantity, level);
}

/** Merge a partial favourite/want/notes update; drop the row when all-default. */
export function setColorMeta(userId: number, colorId: string, patch: ColorMetaInput): void {
  const current = db
    .prepare("SELECT favorite, want, notes FROM color_meta WHERE user_id = ? AND color_id = ?")
    .get(userId, colorId) as { favorite: number; want: number; notes: string | null } | undefined;

  const favorite = patch.favorite ?? !!current?.favorite;
  const want = patch.want ?? !!current?.want;
  const notes = patch.notes !== undefined ? patch.notes || null : (current?.notes ?? null);

  if (!favorite && !want && !notes) {
    db.prepare("DELETE FROM color_meta WHERE user_id = ? AND color_id = ?").run(userId, colorId);
    return;
  }
  db.prepare(
    `INSERT INTO color_meta (user_id, color_id, favorite, want, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, color_id) DO UPDATE SET
       favorite = excluded.favorite, want = excluded.want, notes = excluded.notes,
       updated_at = datetime('now')`,
  ).run(userId, colorId, favorite ? 1 : 0, want ? 1 : 0, notes);
}

/**
 * Record what an inventory upsert changed: sticks added/removed, or — when the
 * count stayed put — the working stick's level moving (a level reset that rides
 * along with a removal is incidental, so it isn't logged separately).
 */
export function logInventoryEvent(
  userId: number,
  colorId: string,
  prev: { quantity: number; level: Level | null },
  next: { quantity: number; level: Level | null },
): void {
  const insert = db.prepare(
    "INSERT INTO inventory_events (user_id, color_id, type, amount, level) VALUES (?, ?, ?, ?, ?)",
  );
  if (next.quantity > prev.quantity) {
    insert.run(userId, colorId, "add", next.quantity - prev.quantity, null);
  } else if (next.quantity < prev.quantity) {
    insert.run(userId, colorId, "remove", prev.quantity - next.quantity, null);
  } else if (next.quantity > 0 && next.level !== prev.level) {
    insert.run(userId, colorId, "level", null, next.level);
  }
}

export function getHistory(userId: number, colorId: string, limit = 50): HistoryEvent[] {
  const rows = db
    .prepare(
      `SELECT id, type, amount, level, created_at AS at FROM inventory_events
       WHERE user_id = ? AND color_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, colorId, limit) as unknown as HistoryEvent[];
  return rows;
}

export function colorExists(id: string): boolean {
  return !!db.prepare("SELECT 1 FROM colors WHERE id = ?").get(id);
}
