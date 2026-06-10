import { hexToHue } from "shared";
import { CATALOG_HEXES } from "../rainbow";

// The full range, hue-ordered (neutrals sort to the end), as reusable gradients.
const SORTED = [...CATALOG_HEXES].sort((a, b) => hexToHue(a) - hexToHue(b));

export const RAINBOW_GRADIENT = `linear-gradient(to right, ${SORTED.join(", ")})`;
export const RAINBOW_CONIC = `conic-gradient(${SORTED.join(", ")}, ${SORTED[0]})`;

/** A thin band of every colour in the catalogue — the app's "bookbinding" edge. */
export function RainbowRibbon() {
  return <div style={{ background: RAINBOW_GRADIENT }} className="h-1 w-full shrink-0" aria-hidden />;
}
