import { type MouseEvent } from "react";
import { LEVEL_META, nextLevel, type Level } from "shared";
import { usePop } from "../usePop";

interface Props {
  level: Level;
  onCycle: (next: Level) => void;
  size?: "sm" | "md";
  /** Icon-only round button (for the dense catalogue grid). */
  compact?: boolean;
}

/** A pie-fill indicator (+ label unless compact); tap to cycle Full -> … -> Empty. */
export function LevelChip({ level, onCycle, size = "sm", compact = false }: Props) {
  const { label, fraction } = LEVEL_META[level];
  const low = fraction <= 0.25;
  const dim = compact ? 16 : size === "sm" ? 14 : 18;
  const r = dim / 2 - 1;
  const tone = low
    ? "border-amber-400 bg-amber-100 text-amber-900"
    : "border-stone-300 bg-white text-stone-700";

  const pop = usePop(level);
  const pie = (
    <svg
      key={pop.key}
      width={dim}
      height={dim}
      viewBox={`0 0 ${dim} ${dim}`}
      className={`shrink-0 ${pop.className}`}
    >
      <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {fraction > 0 && <path d={piePath(dim / 2, dim / 2, r, fraction)} fill="currentColor" />}
    </svg>
  );

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCycle(nextLevel(level));
  };
  const aria = `Remaining: ${label}. Tap to change.`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={aria}
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition active:scale-95 ${tone}`}
      >
        {pie}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium transition active:scale-95 ${
        size === "sm" ? "text-xs" : "text-sm"
      } ${tone}`}
    >
      {pie}
      {label}
    </button>
  );
}

/** SVG path for a pie wedge filling `fraction` of the circle, starting at 12 o'clock. */
function piePath(cx: number, cy: number, r: number, fraction: number): string {
  if (fraction >= 1) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const angle = fraction * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y} Z`;
}
