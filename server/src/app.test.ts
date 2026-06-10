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

    const list = await app.request("/api/colors?catalogue=sennelier", { headers: { cookie } });
    expect(list.status).toBe(200);
    const colors = (await list.json()) as Array<{
      id: string;
      code: string;
      swatch: string;
      inventory: unknown;
    }>;
    expect(colors).toHaveLength(120);
    expect(colors.every((c) => c.inventory === null)).toBe(true);
    expect(colors[0].id).toBe("sennelier-001");
    expect(colors[0].swatch).toBe("/swatches/sennelier/001.png");

    const cats = await app.request("/api/catalogues", { headers: { cookie } });
    expect(cats.status).toBe(200);
    const catList = (await cats.json()) as Array<{ id: string; total: number; owned: number }>;
    expect(catList.map((c) => c.id)).toEqual(["sennelier", "mungyo", "vangogh"]);
    expect(catList.find((c) => c.id === "sennelier")).toMatchObject({ total: 120, owned: 0 });

    const put = await app.request("/api/inventory/sennelier-038", {
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

    // favourite/want/notes meta + the wanted filter
    const meta = await app.request("/api/colors/sennelier-002/meta", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ favorite: true, want: true, notes: "buy two" }),
    });
    expect(meta.status).toBe(200);
    const metaColor = (await meta.json()) as { favorite: boolean; want: boolean; notes: string };
    expect(metaColor).toMatchObject({ favorite: true, want: true, notes: "buy two" });

    const wanted = await app.request("/api/colors?owned=wanted", { headers: { cookie } });
    const wantedList = (await wanted.json()) as Array<{ code: string }>;
    expect(wantedList.map((c) => c.code)).toEqual(["002"]);

    // usage history: the PUT above (0 -> 2 sticks) was recorded
    const hist = await app.request("/api/colors/sennelier-038/history", { headers: { cookie } });
    expect(hist.status).toBe(200);
    const events = (await hist.json()) as Array<{ type: string; amount: number | null }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "add", amount: 2 });
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
