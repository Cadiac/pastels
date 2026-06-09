import { greyHex, hexValue } from "shared";

const STEPS = 11;

/** Dark-to-light greyscale bar with the colour pinned at its perceptual lightness. */
export function ValueScale({ hex }: { hex: string }) {
  const value = hexValue(hex);
  // Keep the marker from poking past the rounded ends of the bar.
  const left = Math.min(97, Math.max(3, value * 100));

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
        Value
      </div>
      <div className="relative">
        <div className="flex h-12 overflow-hidden rounded-card ring-1 ring-black/10">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: greyHex(i / (STEPS - 1)) }} />
          ))}
        </div>
        <div
          style={{ left: `${left}%`, backgroundColor: hex }}
          className="absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/10"
        />
      </div>
    </div>
  );
}
