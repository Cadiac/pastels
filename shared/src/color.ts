// Inventory level model + small colour helpers shared by web and server.

/** Remaining level of the current working stick, ordered Full -> Empty. */
export const LEVELS = [
  "full",
  "three_quarter",
  "half",
  "quarter",
  "almost_out",
  "empty",
] as const;

export type Level = (typeof LEVELS)[number];

/** Display label + fractional fill (0..1) for each level. */
export const LEVEL_META: Record<Level, { label: string; fraction: number }> = {
  full: { label: "Full", fraction: 1 },
  three_quarter: { label: "¾", fraction: 0.75 },
  half: { label: "½", fraction: 0.5 },
  quarter: { label: "¼", fraction: 0.25 },
  almost_out: { label: "Almost out", fraction: 0.1 },
  empty: { label: "Empty", fraction: 0 },
};

/** Levels considered "running low" (used by the Low filter). */
export const LOW_LEVELS: readonly Level[] = ["quarter", "almost_out", "empty"];

export function isLowLevel(level: Level | null): boolean {
  return level !== null && LOW_LEVELS.includes(level);
}

/** Cycle to the next level when tapping the chip; wraps Empty -> Full. */
export function nextLevel(level: Level): Level {
  const i = LEVELS.indexOf(level);
  return LEVELS[(i + 1) % LEVELS.length];
}

/**
 * Hue (0..360) derived from a `#rrggbb` string, for the "rainbow" sort.
 * Greys/near-neutrals get a large sentinel so they sort to the end.
 */
export function hexToHue(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 999;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.06) return 900 + (1 - max) * 10; // near-neutral: group greys at the end
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
