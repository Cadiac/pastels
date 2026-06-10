import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CatalogueColorSchema, CatalogueSchema } from "shared";
import { z } from "zod";
import { db, migrate } from "./db";
import { CATALOGUES_JSON, DATA_DIR } from "./paths";

/**
 * Create tables and (idempotently) load every catalogue: catalogues.json
 * describes them, data/<id>/colors.json holds each one's colours.
 */
export function seed(): number {
  migrate();

  const catalogues = z
    .array(CatalogueSchema)
    .parse(JSON.parse(readFileSync(CATALOGUES_JSON, "utf8")));

  // Catalogues keep the order they have in catalogues.json.
  const upsertCatalogue = db.prepare(`
    INSERT INTO catalogues (id, brand, name, short_name, position)
    VALUES (@id, @brand, @name, @short_name, @position)
    ON CONFLICT(id) DO UPDATE SET
      brand=excluded.brand, name=excluded.name, short_name=excluded.short_name,
      position=excluded.position
  `);

  const upsertColor = db.prepare(`
    INSERT INTO colors (id, catalogue, code, name, names_json, transparency,
                        pigments_json, lightfastness, iridescent, new, giant, hex, swatch)
    VALUES (@id, @catalogue, @code, @name, @names_json, @transparency,
            @pigments_json, @lightfastness, @iridescent, @new, @giant, @hex, @swatch)
    ON CONFLICT(id) DO UPDATE SET
      catalogue=excluded.catalogue, code=excluded.code, name=excluded.name,
      names_json=excluded.names_json, transparency=excluded.transparency,
      pigments_json=excluded.pigments_json, lightfastness=excluded.lightfastness,
      iridescent=excluded.iridescent, new=excluded.new, giant=excluded.giant,
      hex=excluded.hex, swatch=excluded.swatch
  `);

  let total = 0;
  db.exec("BEGIN");
  try {
    for (const [position, cat] of catalogues.entries()) {
      upsertCatalogue.run({
        id: cat.id,
        brand: cat.brand,
        name: cat.name,
        short_name: cat.shortName,
        position,
      });

      const raw = JSON.parse(readFileSync(resolve(DATA_DIR, cat.id, "colors.json"), "utf8"));
      const colors = z.array(CatalogueColorSchema).parse(raw);
      for (const c of colors) {
        upsertColor.run({
          id: `${cat.id}-${c.code}`,
          catalogue: cat.id,
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
      total += colors.length;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return total;
}

// Run directly via `pnpm seed`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = seed();
  console.log(`Seeded ${n} colours across catalogues -> SQLite.`);
}
