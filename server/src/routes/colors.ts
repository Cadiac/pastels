import { Hono } from "hono";
import { hexToHue, hexValue, isLowLevel, OwnedFilterSchema, SortSchema, type Level } from "shared";
import { getColorForUser, getColorsForUser } from "../store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

export const colors = new Hono<AppEnv>();

colors.use("*", requireAuth);

colors.get("/", (c) => {
  const user = c.get("user")!;
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const owned = OwnedFilterSchema.catch("all").parse(c.req.query("owned"));
  const sort = SortSchema.catch("code").parse(c.req.query("sort"));

  let list = getColorsForUser(user.id);

  if (q) {
    list = list.filter((c) => {
      const haystack = [
        c.code,
        c.name,
        ...Object.values(c.names),
        ...c.pigments,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (owned === "owned") list = list.filter((c) => c.inventory);
  else if (owned === "missing") list = list.filter((c) => !c.inventory);
  else if (owned === "low")
    list = list.filter((c) => c.inventory && isLowLevel((c.inventory.level as Level) ?? null));

  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "hue") list.sort((a, b) => hexToHue(a.hex) - hexToHue(b.hex));
  else if (sort === "value") list.sort((a, b) => hexValue(a.hex) - hexValue(b.hex));
  // "code" already comes ordered from the store.

  return c.json(list);
});

colors.get("/:code", (c) => {
  const user = c.get("user")!;
  const color = getColorForUser(user.id, c.req.param("code"));
  if (!color) return c.json({ error: "Not found" }, 404);
  return c.json(color);
});
