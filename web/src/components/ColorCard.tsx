import { type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { ColorWithInventory, Level } from "shared";
import { SwatchImg } from "./SwatchImg";
import { LevelChip } from "./LevelChip";
import { useSetInventory } from "../api/hooks";

interface Props {
  color: ColorWithInventory;
  view: "grid" | "list";
}

const ICON_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 active:scale-95";

export function ColorCard({ color, view }: Props) {
  const setInventory = useSetInventory();
  const inv = color.inventory;
  const quantity = inv?.quantity ?? 0;
  const level: Level = inv?.level ?? "full";

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
        className={`${ICON_BTN} border-red-200 text-red-500`}
        aria-label="Remove one stick"
      >
        <Trash2 size={14} />
      </button>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
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
      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 active:scale-95"
    >
      <Plus size={14} /> Add
    </button>
  );

  if (view === "list") {
    return (
      <Link
        to={`/c/${color.code}`}
        className="flex items-center gap-3 border-b border-slate-100 bg-white px-3 py-2 active:bg-slate-50"
      >
        <SwatchImg
          code={color.code}
          hex={color.hex}
          name={color.name}
          className="h-9 w-16 shrink-0 rounded object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{color.name}</div>
          <div className="font-mono text-xs text-slate-400">{color.code}</div>
        </div>
        {Controls}
      </Link>
    );
  }

  return (
    <Link
      to={`/c/${color.code}`}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm active:scale-[0.99]"
    >
      <SwatchImg
        code={color.code}
        hex={color.hex}
        name={color.name}
        className="h-16 w-full object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium leading-tight text-slate-900">
              {color.name}
            </span>
            {color.iridescent && <Sparkles size={13} className="shrink-0 text-amber-500" />}
          </div>
          <div className="font-mono text-xs text-slate-400">{color.code}</div>
        </div>
        <div className="mt-auto">{Controls}</div>
      </div>
    </Link>
  );
}
