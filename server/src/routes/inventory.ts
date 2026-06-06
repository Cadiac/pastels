import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { InventoryInputSchema } from "shared";
import { colorExists, getColorForUser, setInventory } from "../store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

export const inventory = new Hono<AppEnv>();

inventory.use("*", requireAuth);

inventory.put("/:code", zValidator("json", InventoryInputSchema), (c) => {
  const user = c.get("user")!;
  const code = c.req.param("code");
  if (!colorExists(code)) return c.json({ error: "Unknown colour" }, 404);

  const { quantity, level } = c.req.valid("json");
  // A stick with no quantity has no remaining level.
  setInventory(user.id, code, quantity, quantity > 0 ? level : null);

  return c.json(getColorForUser(user.id, code));
});
