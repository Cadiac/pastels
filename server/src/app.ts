import { existsSync } from "node:fs";
import { relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { sessionMiddleware } from "./middleware";
import { auth } from "./routes/auth";
import { colors } from "./routes/colors";
import { inventory } from "./routes/inventory";
import { SWATCHES_DIR, WEB_DIST } from "./paths";
import type { AppEnv } from "./types";

/** Build the Hono app (no DB migration, no listener — callers handle those). */
export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", sessionMiddleware);

  app.route("/api/auth", auth);
  app.route("/api/colors", colors);
  app.route("/api/inventory", inventory);

  // Swatch images from data/swatches (served in dev and prod alike).
  const swatchRoot = relative(process.cwd(), SWATCHES_DIR) || ".";
  app.use(
    "/swatches/*",
    serveStatic({ root: swatchRoot, rewriteRequestPath: (p) => p.replace(/^\/swatches/, "") }),
  );

  // In production, serve the built SPA with a history-API fallback.
  if (process.env.NODE_ENV === "production" && existsSync(WEB_DIST)) {
    const webRoot = relative(process.cwd(), WEB_DIST) || ".";
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", serveStatic({ path: `${webRoot}/index.html` }));
  }

  return app;
}
