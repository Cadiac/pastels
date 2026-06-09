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

// --- Per-user colour metadata (favourite / wantlist / notes) -----------------

/** What the PATCH /api/colors/:code/meta endpoint accepts (partial update). */
export const ColorMetaInputSchema = z.object({
  favorite: z.boolean().optional(),
  want: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type ColorMetaInput = z.infer<typeof ColorMetaInputSchema>;

export const ColorWithInventorySchema = ColorSchema.extend({
  inventory: InventoryItemSchema.nullable(),
  favorite: z.boolean(),
  want: z.boolean(),
  notes: z.string().nullable(),
});
export type ColorWithInventory = z.infer<typeof ColorWithInventorySchema>;

export const ColorsResponseSchema = z.array(ColorWithInventorySchema);

// --- Usage history ------------------------------------------------------------

export const HistoryEventSchema = z.object({
  id: z.number().int(),
  type: z.enum(["add", "remove", "level"]),
  /** Sticks added/removed (for add/remove events). */
  amount: z.number().int().nullable(),
  /** New working-stick level (for level events). */
  level: LevelSchema.nullable(),
  /** UTC timestamp, `YYYY-MM-DD HH:MM:SS`. */
  at: z.string(),
});
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export const HistoryResponseSchema = z.array(HistoryEventSchema);

// --- Filters / query --------------------------------------------------------

export const SortSchema = z.enum(["code", "name", "hue", "value"]);
export type Sort = z.infer<typeof SortSchema>;

export const OwnedFilterSchema = z.enum(["all", "owned", "missing", "low", "favorites", "wanted"]);
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
