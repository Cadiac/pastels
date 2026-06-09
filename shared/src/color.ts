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

/** True if a `#rrggbb` colour is light enough to need dark text on top. */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  // perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** Smallest angular distance between two hues, in degrees (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Hue (0..360) derived from a `#rrggbb` string, for the "rainbow" sort.
 * Greys/near-neutrals get a large sentinel so they sort to the end.
 */
/**
 * Perceptual lightness (CIE L*, scaled 0..1) of a `#rrggbb` colour,
 * for the "value" sort and the detail-page value scale.
 */
export function hexValue(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => lin(parseInt(h, 16) / 255));
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; // relative luminance
  const L = Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16; // CIE L*, 0..100
  return L / 100;
}

/** Grey `#rrggbb` with the given perceptual lightness (0..1) — inverse of hexValue. */
export function greyHex(value: number): string {
  const L = Math.min(1, Math.max(0, value)) * 100;
  const Y = L <= 8 ? L / 903.3 : ((L + 16) / 116) ** 3;
  const c = Y <= 0.0031308 ? 12.92 * Y : 1.055 * Y ** (1 / 2.4) - 0.055;
  const n = Math.round(Math.min(1, Math.max(0, c)) * 255);
  const h = n.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

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
