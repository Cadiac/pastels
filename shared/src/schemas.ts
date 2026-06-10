import { z } from "zod";
import { LEVELS } from "./color";

// --- Catalogues (brand colour ranges) ----------------------------------------

export const CatalogueSchema = z.object({
  id: z.string(),
  brand: z.string(),
  name: z.string(),
  shortName: z.string(),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

/** What GET /api/catalogues returns: catalogue + per-user ownership counts. */
export const CatalogueInfoSchema = CatalogueSchema.extend({
  total: z.number().int(),
  owned: z.number().int(),
});
export type CatalogueInfo = z.infer<typeof CatalogueInfoSchema>;

// English is the app language; other chart languages are kept when a brand
// publishes them (Sennelier has six, Mungyo only English).
export const NamesSchema = z.object({ en: z.string() }).catchall(z.string());
export type Names = z.infer<typeof NamesSchema>;

export const TransparencySchema = z.enum(["T", "O", "T/O"]);

/**
 * One entry of a catalogue's colors.json. Fields a brand doesn't publish are
 * null/empty; `lightfastness` is the brand's own scale as printed (Sennelier
 * "I"/"II"/"III", Mungyo star counts like "3/5").
 */
export const CatalogueColorSchema = z.object({
  code: z.string(),
  name: z.string(),
  names: NamesSchema,
  transparency: TransparencySchema.nullable(),
  pigments: z.array(z.string()),
  lightfastness: z.string().nullable(),
  iridescent: z.boolean(),
  new: z.boolean(),
  giant: z.boolean().default(false),
  hex: z.string(),
  swatch: z.string(),
});
export type CatalogueColor = z.infer<typeof CatalogueColorSchema>;

/** A colour as the API returns it: globally identified across catalogues. */
export const ColorSchema = CatalogueColorSchema.extend({
  /** Globally unique: `<catalogue>-<code>`, e.g. "sennelier-038". */
  id: z.string(),
  catalogue: z.string(),
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
