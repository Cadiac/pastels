import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, userForSession } from "./auth";
import type { AppEnv } from "./types";

/** Populate `user` from the session cookie on every request (null if none). */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", userForSession(getCookie(c, SESSION_COOKIE)));
  await next();
});

/** Reject unauthenticated requests with 401. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Not authenticated" }, 401);
  await next();
});
