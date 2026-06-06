import { serve } from "@hono/node-server";
import { db, migrate } from "./db";
import { seed } from "./seed";
import { createApp } from "./app";

// Ensure schema + catalogue exist (auto-seed on first run).
migrate();
const colourCount = (db.prepare("SELECT COUNT(*) AS n FROM colors").get() as unknown as { n: number })
  .n;
if (colourCount === 0) {
  const n = seed();
  console.log(`Seeded ${n} colours (catalogue was empty).`);
}

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
