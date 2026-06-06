import type { ColorWithInventory, Level } from "shared";
import { db } from "./db";

interface ColorRow {
  code: string;
  name: string;
  names_json: string;
  transparency: string;
  pigments_json: string;
  lightfastness: string | null;
  iridescent: number;
  new: number;
  giant: number;
  hex: string;
  swatch: string;
  quantity: number | null;
  level: string | null;
}

function mapRow(r: ColorRow): ColorWithInventory {
  return {
    code: r.code,
    name: r.name,
    names: JSON.parse(r.names_json),
    transparency: r.transparency as ColorWithInventory["transparency"],
    pigments: JSON.parse(r.pigments_json),
    lightfastness: r.lightfastness as ColorWithInventory["lightfastness"],
    iridescent: !!r.iridescent,
    new: !!r.new,
    giant: !!r.giant,
    hex: r.hex,
    swatch: r.swatch,
    inventory:
      r.quantity != null && r.quantity > 0
        ? { quantity: r.quantity, level: (r.level as Level | null) ?? null }
        : null,
  };
}

const SELECT = `
  SELECT c.*, i.quantity AS quantity, i.level AS level
  FROM colors c
  LEFT JOIN inventory i ON i.code = c.code AND i.user_id = @userId
`;

export function getColorsForUser(userId: number): ColorWithInventory[] {
  const rows = db.prepare(`${SELECT} ORDER BY c.code`).all({ userId }) as unknown as ColorRow[];
  return rows.map(mapRow);
}

export function getColorForUser(userId: number, code: string): ColorWithInventory | null {
  const row = db.prepare(`${SELECT} WHERE c.code = @code`).get({ userId, code }) as unknown as
    | ColorRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function setInventory(
  userId: number,
  code: string,
  quantity: number,
  level: Level | null,
): void {
  if (quantity <= 0) {
    db.prepare("DELETE FROM inventory WHERE user_id = ? AND code = ?").run(userId, code);
    return;
  }
  db.prepare(
    `INSERT INTO inventory (user_id, code, quantity, level, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, code) DO UPDATE SET
       quantity = excluded.quantity, level = excluded.level, updated_at = datetime('now')`,
  ).run(userId, code, quantity, level);
}

export function colorExists(code: string): boolean {
  return !!db.prepare("SELECT 1 FROM colors WHERE code = ?").get(code);
}
