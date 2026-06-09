import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { InventoryInputSchema } from "shared";
import { colorExists, getColorForUser, logInventoryEvent, setInventory } from "../store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

export const inventory = new Hono<AppEnv>();

inventory.use("*", requireAuth);

inventory.put("/:code", zValidator("json", InventoryInputSchema), (c) => {
  const user = c.get("user")!;
  const code = c.req.param("code");
  if (!colorExists(code)) return c.json({ error: "Unknown colour" }, 404);

  const { quantity, level } = c.req.valid("json");
  const prev = getColorForUser(user.id, code)?.inventory ?? { quantity: 0, level: null };
  const next = { quantity, level: quantity > 0 ? level : null };
  // A stick with no quantity has no remaining level.
  setInventory(user.id, code, next.quantity, next.level);
  logInventoryEvent(user.id, code, prev, next);

  return c.json(getColorForUser(user.id, code));
});
