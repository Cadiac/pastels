import { z } from "zod";
import { LEVELS } from "./color";

// --- Catalogue (mirrors data/colors.json exactly) ---------------------------

export const NamesSchema = z.object({
  fr: z.string(),
  en: z.string(),
  de: z.string(),
  es: z.string(),
  it: z.string(),
  nl: z.string(),
});

export const TransparencySchema = z.enum(["T", "O", "T/O"]);
export const LightfastnessSchema = z.enum(["I", "II", "III"]).nullable();

export const ColorSchema = z.object({
  code: z.string(),
  name: z.string(),
  names: NamesSchema,
  transparency: TransparencySchema,
  pigments: z.array(z.string()),
  lightfastness: LightfastnessSchema,
  iridescent: z.boolean(),
  new: z.boolean(),
  giant: z.boolean(),
  hex: z.string(),
  swatch: z.string(),
});
export type Color = z.infer<typeof ColorSchema>;

// --- Inventory --------------------------------------------------------------

export const LevelSchema = z.enum(LEVELS);

export const InventoryItemSchema = z.object({
  quantity: z.number().int().min(0),
  level: LevelSchema.nullable(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/** What the PUT /api/inventory/:code endpoint accepts. */
export const InventoryInputSchema = z.object({
  quantity: z.number().int().min(0).max(99),
  level: LevelSchema.nullable(),
});
export type InventoryInput = z.infer<typeof InventoryInputSchema>;

export const ColorWithInventorySchema = ColorSchema.extend({
  inventory: InventoryItemSchema.nullable(),
});
export type ColorWithInventory = z.infer<typeof ColorWithInventorySchema>;

export const ColorsResponseSchema = z.array(ColorWithInventorySchema);

// --- Filters / query --------------------------------------------------------

export const SortSchema = z.enum(["code", "name", "hue"]);
export type Sort = z.infer<typeof SortSchema>;

export const OwnedFilterSchema = z.enum(["all", "owned", "missing", "low"]);
export type OwnedFilter = z.infer<typeof OwnedFilterSchema>;

// --- Auth -------------------------------------------------------------------

export const CredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only"),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
});
export type User = z.infer<typeof UserSchema>;
