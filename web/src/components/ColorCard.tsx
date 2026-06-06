import { Link } from "react-router-dom";
import { Plus, Sparkles } from "lucide-react";
import type { ColorWithInventory, Level } from "shared";
import { SwatchImg } from "./SwatchImg";
import { LevelChip } from "./LevelChip";
import { useSetInventory } from "../api/hooks";

interface Props {
  color: ColorWithInventory;
  view: "grid" | "list";
}

export function ColorCard({ color, view }: Props) {
  const setInventory = useSetInventory();
  const inv = color.inventory;
  const quantity = inv?.quantity ?? 0;
  const level: Level = inv?.level ?? "full";

  const own = () => setInventory.mutate({ code: color.code, input: { quantity: 1, level: "full" } });
  const cycle = (next: Level) =>
    setInventory.mutate({ code: color.code, input: { quantity: quantity || 1, level: next } });

  const Controls = inv ? (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        ×{quantity}
      </span>
      <LevelChip level={level} onCycle={cycle} />
    </div>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        own();
      }}
      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 active:scale-95"
    >
      <Plus size={14} /> Own
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
