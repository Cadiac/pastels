import { beforeAll, describe, expect, it } from "vitest";

// In-memory DB; must be set before importing modules that open the connection.
process.env.DB_FILE = ":memory:";

const { migrate } = await import("./db");
const { seed } = await import("./seed");
const { createApp } = await import("./app");

const app = createApp();

function cookieFrom(res: Response): string {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.split(";")[0];
}

describe("API smoke test", () => {
  beforeAll(() => {
    migrate();
    seed();
  });

  it("requires auth for the catalogue", async () => {
    const res = await app.request("/api/colors");
    expect(res.status).toBe(401);
  });

  it("registers, browses, and updates inventory end-to-end", async () => {
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "tester", password: "secret123" }),
    });
    expect(reg.status).toBe(201);
    const cookie = cookieFrom(reg);
    expect(cookie).toMatch(/^sid=/);

    const list = await app.request("/api/colors", { headers: { cookie } });
    expect(list.status).toBe(200);
    const colors = (await list.json()) as Array<{ code: string; inventory: unknown }>;
    expect(colors).toHaveLength(120);
    expect(colors.every((c) => c.inventory === null)).toBe(true);

    const put = await app.request("/api/inventory/038", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ quantity: 2, level: "half" }),
    });
    expect(put.status).toBe(200);
    const updated = (await put.json()) as { inventory: { quantity: number; level: string } };
    expect(updated.inventory).toEqual({ quantity: 2, level: "half" });

    const owned = await app.request("/api/colors?owned=owned", { headers: { cookie } });
    const ownedList = (await owned.json()) as Array<{ code: string }>;
    expect(ownedList).toHaveLength(1);
    expect(ownedList[0].code).toBe("038");
  });

  it("rejects invalid credentials with a Zod 400", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "x", password: "y" }),
    });
    expect(res.status).toBe(400);
  });
});
