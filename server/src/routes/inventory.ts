import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { InventoryInputSchema } from "shared";
import { colorExists, getColorForUser, logInventoryEvent, setInventory } from "../store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

export const inventory = new Hono<AppEnv>();

inventory.use("*", requireAuth);

inventory.put("/:id", zValidator("json", InventoryInputSchema), (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  if (!colorExists(id)) return c.json({ error: "Unknown colour" }, 404);

  const { quantity, level } = c.req.valid("json");
  const prev = getColorForUser(user.id, id)?.inventory ?? { quantity: 0, level: null };
  const next = { quantity, level: quantity > 0 ? level : null };
  // A stick with no quantity has no remaining level.
  setInventory(user.id, id, next.quantity, next.level);
  logInventoryEvent(user.id, id, prev, next);

  return c.json(getColorForUser(user.id, id));
});
