import { type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { ColorWithInventory, Level } from "shared";
import { LevelChip } from "./LevelChip";
import { useSetInventory } from "../api/hooks";

interface Props {
  color: ColorWithInventory;
  view: "grid" | "list";
}

// Cream "wrapper". Owned reads as solid/crisp; not-owned recedes (translucent
// wrapper + muted text) while the opaque swatch keeps the colour fully accurate.
const CARD_OWNED = "bg-[#f3ebd5] text-stone-800 shadow-md";
const CARD_UNOWNED = "bg-[#f3ebd5]/55 text-stone-500 shadow-sm";
const ICON_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-stone-600 active:scale-95";

export function ColorCard({ color, view }: Props) {
  const setInventory = useSetInventory();
  const inv = color.inventory;
  const quantity = inv?.quantity ?? 0;
  const level: Level = inv?.level ?? "full";

  const wrapper = inv ? CARD_OWNED : CARD_UNOWNED;

  const set = (q: number, l: Level | null) =>
    setInventory.mutate({ code: color.code, input: { quantity: q, level: l } });

  // Keep button taps from also triggering the card's <Link> navigation.
  const act = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const Controls = inv ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <LevelChip level={level} onCycle={(next) => set(quantity || 1, next)} />
      <button
        type="button"
        onClick={act(() => set(quantity - 1, quantity - 1 > 0 ? "full" : null))}
        className={`${ICON_BTN} border-red-300 text-red-600`}
        aria-label="Remove one stick"
      >
        <Trash2 size={14} />
      </button>
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
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
      className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700 active:scale-95"
    >
      <Plus size={14} /> Add
    </button>
  );

  if (view === "list") {
    return (
      <Link
        to={`/c/${color.code}`}
        className={`flex items-center gap-3 border-b border-black/5 px-3 py-2 active:brightness-95 ${wrapper}`}
      >
        <div
          style={{ backgroundColor: color.hex }}
          className="h-9 w-16 shrink-0 rounded ring-1 ring-black/10"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{color.name}</div>
          <div className="font-mono text-xs leading-none text-stone-500">{color.code}</div>
        </div>
        {Controls}
      </Link>
    );
  }

  return (
    <Link
      to={`/c/${color.code}`}
      className={`flex min-h-32 flex-col overflow-hidden rounded-lg ring-1 ring-black/5 transition active:scale-[0.99] ${wrapper}`}
    >
      {/* name → flat hex colour block (the detail page shows the real swatch) → controls */}
      <div className="min-w-0 px-2.5 pb-1.5 pt-2.5">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold leading-tight">{color.name}</span>
          {color.iridescent && <Sparkles size={13} className="shrink-0 text-amber-600" />}
        </div>
        <div className="mt-0.5 font-mono text-xs leading-none text-stone-500">{color.code}</div>
      </div>
      <div className="px-2.5">
        <div
          style={{ backgroundColor: color.hex }}
          className="h-16 w-full rounded-md ring-1 ring-black/10"
        />
      </div>
      <div className="mt-auto px-2.5 pb-2.5 pt-2">{Controls}</div>
    </Link>
  );
}
