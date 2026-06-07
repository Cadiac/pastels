import { type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { isLight, type ColorWithInventory, type Level } from "shared";
import { LevelChip } from "./LevelChip";
import { useSetInventory } from "../api/hooks";

interface Props {
  color: ColorWithInventory;
  view: "grid" | "list";
}

const ICON_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 active:scale-95";

export function ColorCard({ color, view }: Props) {
  const setInventory = useSetInventory();
  const inv = color.inventory;
  const owned = !!inv;
  const quantity = inv?.quantity ?? 0;
  const level: Level = inv?.level ?? "full";
  // Inverted code chip that pops on any hue (dark chip on light colours, vice versa).
  const codeChipBg = isLight(color.hex) ? "#1c1917" : "#ffffff";

  const set = (q: number, l: Level | null) =>
    setInventory.mutate({ code: color.code, input: { quantity: q, level: l } });

  // Keep button taps from also triggering the card's <Link> navigation.
  const act = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const Controls = inv ? (
    <div className="flex items-center gap-1.5">
      <LevelChip level={level} onCycle={(next) => set(quantity || 1, next)} compact />
      <button
        type="button"
        onClick={act(() => set(quantity - 1, quantity - 1 > 0 ? "full" : null))}
        className={`${ICON_BTN} border-red-300 text-red-600`}
        aria-label="Remove one stick"
      >
        <Trash2 size={14} />
      </button>
      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
        ×{quantity}
      </span>
      <button
        type="button"
        onClick={act(() => set(Math.min(99, quantity + 1), level))}
        className={ICON_BTN}
        aria-label="Add another stick"
      >
        <Plus size={15} />
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={act(() => set(1, "full"))}
      className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 active:scale-95"
    >
      <Plus size={14} /> Add
    </button>
  );

  if (view === "list") {
    return (
      <Link
        to={`/c/${color.code}`}
        className={`flex items-center gap-3 border-b border-black/5 px-3 py-2 active:brightness-95 ${
          owned ? "bg-white" : "bg-white/55"
        }`}
      >
        <div
          style={{ backgroundColor: color.hex }}
          className="h-9 w-14 shrink-0 rounded-md ring-1 ring-inset ring-black/10"
        />
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm font-semibold ${owned ? "text-stone-800" : "text-stone-500"}`}>
            {color.name}
          </div>
          <div className="font-mono text-xs leading-none text-stone-400">{color.code}</div>
        </div>
        {Controls}
      </Link>
    );
  }

  return (
    <Link
      to={`/c/${color.code}`}
      className={`flex flex-col overflow-hidden rounded-2xl ring-1 ring-black/5 transition active:scale-[0.99] ${
        owned ? "bg-white shadow-md" : "bg-white/55 shadow-sm"
      }`}
    >
      {/* colour hero with a corner code chip → name → controls */}
      <div
        style={{ backgroundColor: color.hex }}
        className="relative h-28 w-full border-b border-black/[0.06]"
      >
        <span
          style={{ backgroundColor: codeChipBg, color: color.hex }}
          className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none shadow-sm"
        >
          {color.code}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`min-w-0 truncate text-sm font-semibold leading-tight ${
              owned ? "text-stone-900" : "text-stone-500"
            }`}
          >
            {color.name}
          </span>
          {color.iridescent && <Sparkles size={12} className="shrink-0 text-amber-500" />}
        </div>
        <div className="mt-2">{Controls}</div>
      </div>
    </Link>
  );
}
