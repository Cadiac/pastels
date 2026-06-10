import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ColorMetaInputSchema,
  hexToHue,
  hexValue,
  isLowLevel,
  OwnedFilterSchema,
  SortSchema,
  type Level,
} from "shared";
import {
  colorExists,
  getCataloguesForUser,
  getColorForUser,
  getColorsForUser,
  getHistory,
  setColorMeta,
} from "../store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

export const catalogues = new Hono<AppEnv>();
catalogues.use("*", requireAuth);
catalogues.get("/", (c) => c.json(getCataloguesForUser(c.get("user")!.id)));

export const colors = new Hono<AppEnv>();

colors.use("*", requireAuth);

colors.get("/", (c) => {
  const user = c.get("user")!;
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const owned = OwnedFilterSchema.catch("all").parse(c.req.query("owned"));
  const sort = SortSchema.catch("code").parse(c.req.query("sort"));
  const catalogue = c.req.query("catalogue") || undefined;

  let list = getColorsForUser(user.id, catalogue);

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
  else if (owned === "favorites") list = list.filter((c) => c.favorite);
  else if (owned === "wanted") list = list.filter((c) => c.want);

  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "hue") list.sort((a, b) => hexToHue(a.hex) - hexToHue(b.hex));
  else if (sort === "value") list.sort((a, b) => hexValue(a.hex) - hexValue(b.hex));
  // "code" already comes ordered from the store.

  return c.json(list);
});

colors.get("/:id", (c) => {
  const user = c.get("user")!;
  const color = getColorForUser(user.id, c.req.param("id"));
  if (!color) return c.json({ error: "Not found" }, 404);
  return c.json(color);
});

colors.patch("/:id/meta", zValidator("json", ColorMetaInputSchema), (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  if (!colorExists(id)) return c.json({ error: "Unknown colour" }, 404);

  setColorMeta(user.id, id, c.req.valid("json"));
  return c.json(getColorForUser(user.id, id));
});

colors.get("/:id/history", (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  if (!colorExists(id)) return c.json({ error: "Unknown colour" }, 404);

  return c.json(getHistory(user.id, id));
});
