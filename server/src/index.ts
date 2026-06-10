import { serve } from "@hono/node-server";
import { seed } from "./seed";
import { createApp } from "./app";

// Migrate + upsert all catalogues on every boot: idempotent, a few hundred
// rows, and it means a redeploy with new catalogue data is self-applying.
const n = seed();
console.log(`Catalogue ready (${n} colours).`);

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
// Bind to localhost by default; in production nginx is the only public listener.
const hostname = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`API listening on http://${hostname}:${info.port}`);
});
