import { readFileSync } from "node:fs";
import { ColorSchema } from "shared";
import { z } from "zod";
import { db, migrate } from "./db";
import { COLORS_JSON } from "./paths";

/** Create tables and (idempotently) load the catalogue from data/colors.json. */
export function seed(): number {
  migrate();
  const raw = JSON.parse(readFileSync(COLORS_JSON, "utf8"));
  const colors = z.array(ColorSchema).parse(raw);

  const upsert = db.prepare(`
    INSERT INTO colors (code, name, names_json, transparency, pigments_json,
                        lightfastness, iridescent, new, giant, hex, swatch)
    VALUES (@code, @name, @names_json, @transparency, @pigments_json,
            @lightfastness, @iridescent, @new, @giant, @hex, @swatch)
    ON CONFLICT(code) DO UPDATE SET
      name=excluded.name, names_json=excluded.names_json,
      transparency=excluded.transparency, pigments_json=excluded.pigments_json,
      lightfastness=excluded.lightfastness, iridescent=excluded.iridescent,
      new=excluded.new, giant=excluded.giant, hex=excluded.hex, swatch=excluded.swatch
  `);

  db.exec("BEGIN");
  try {
    for (const c of colors) {
      upsert.run({
        code: c.code,
        name: c.name,
        names_json: JSON.stringify(c.names),
        transparency: c.transparency,
        pigments_json: JSON.stringify(c.pigments),
        lightfastness: c.lightfastness,
        iridescent: c.iridescent ? 1 : 0,
        new: c.new ? 1 : 0,
        giant: c.giant ? 1 : 0,
        hex: c.hex,
        swatch: c.swatch,
      });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return colors.length;
}

// Run directly via `pnpm seed`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = seed();
  console.log(`Seeded ${n} colours into ${COLORS_JSON.replace(/.*\//, "")} -> SQLite.`);
}
