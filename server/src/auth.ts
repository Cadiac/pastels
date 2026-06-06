import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "shared";
import { db } from "./db";

const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 30;

/** Hash a password as `salt:hash` (hex), using Node's built-in scrypt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- users ------------------------------------------------------------------

export function createUser(username: string, password: string): User {
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hashPassword(password));
  return { id: Number(info.lastInsertRowid), username };
}

export function usernameTaken(username: string): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
}

export function authenticate(username: string, password: string): User | null {
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as unknown as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

// --- sessions ---------------------------------------------------------------

export const SESSION_COOKIE = "sid";

export function createSession(userId: number): string {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    expires,
  );
  return id;
}

export function userForSession(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as unknown as User | undefined;
  return row ?? null;
}

export function destroySession(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
}
