import { Hono, type Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { CredentialsSchema } from "shared";
import {
  authenticate,
  createSession,
  createUser,
  destroySession,
  SESSION_COOKIE,
  usernameTaken,
} from "../auth";
import type { AppEnv } from "../types";

const SESSION_MAX_AGE = 30 * 86400; // seconds

function issueSession(c: Context<AppEnv>, userId: number): void {
  const token = createSession(userId);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export const auth = new Hono<AppEnv>();

auth.post("/register", zValidator("json", CredentialsSchema), (c) => {
  const { username, password } = c.req.valid("json");
  if (usernameTaken(username)) {
    return c.json({ error: "Username already taken" }, 409);
  }
  const user = createUser(username, password);
  issueSession(c, user.id);
  return c.json(user, 201);
});

auth.post("/login", zValidator("json", CredentialsSchema), (c) => {
  const { username, password } = c.req.valid("json");
  const user = authenticate(username, password);
  if (!user) return c.json({ error: "Invalid username or password" }, 401);
  issueSession(c, user.id);
  return c.json(user);
});

auth.post("/logout", (c) => {
  destroySession(getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  return c.json(user);
});
