import { type CSSProperties, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Heart, Plus, Sparkles, Trash2 } from "lucide-react";
import { isLight, type ColorWithInventory, type Level } from "shared";
import { LevelChip } from "./LevelChip";
import { useSetInventory, useSetMeta } from "../api/hooks";
import { usePop } from "../usePop";

interface Props {
  color: ColorWithInventory;
  view: "grid" | "list";
}

const ICON_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 transition active:scale-95";

export function ColorCard({ color, view }: Props) {
  const setInventory = useSetInventory();
  const setMeta = useSetMeta();
  const inv = color.inventory;
  const owned = !!inv;
  const quantity = inv?.quantity ?? 0;
  const level: Level = inv?.level ?? "full";
  const light = isLight(color.hex);
  // Inverted code chip that pops on any hue (dark chip on light colours, vice versa).
  const codeChipBg = light ? "#1c1917" : "#ffffff";
  const favPop = usePop(color.favorite);
  const wantPop = usePop(color.want);
  const qtyPop = usePop(quantity);

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
      <span
        key={qtyPop.key}
        className={`rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 ${qtyPop.className}`}
      >
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
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={act(() => set(1, "full"))}
        className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 active:scale-95"
      >
        <Plus size={14} /> Add
      </button>
      <button
        type="button"
        onClick={act(() => setMeta.mutate({ code: color.code, input: { want: !color.want } }))}
        className={`${ICON_BTN} ${color.want ? "border-amber-400 bg-amber-50 text-amber-600" : ""}`}
        aria-label={color.want ? "Remove from want list" : "Add to want list"}
        aria-pressed={color.want}
      >
        <Bookmark
          key={wantPop.key}
          size={14}
          fill={color.want ? "currentColor" : "none"}
          className={wantPop.className}
        />
      </button>
    </div>
  );

  if (view === "list") {
    return (
      <Link
        to={`/c/${color.code}`}
        className={`flex items-center gap-3 border-b border-black/5 px-3 py-2 active:brightness-95 ${
          owned ? "bg-white" : "bg-white/20"
        }`}
      >
        <div
          style={{ backgroundColor: color.hex }}
          className="h-9 w-14 shrink-0 rounded-chip ring-1 ring-inset ring-black/10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span
              className={`truncate font-display text-[15px] font-semibold ${owned ? "text-stone-800" : "text-stone-400"}`}
            >
              {color.name}
            </span>
            {color.favorite && (
              <Heart size={12} fill="currentColor" className="shrink-0 text-red-500" />
            )}
            {color.want && !owned && (
              <Bookmark size={12} fill="currentColor" className="shrink-0 text-amber-500" />
            )}
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
      style={{ "--tint": color.hex } as CSSProperties}
      className={`flex flex-col overflow-hidden rounded-card ring-1 transition active:scale-[0.99] hover:-translate-y-px ${
        owned ? "bg-white shadow-tinted ring-black/5 hover:shadow-tinted-lg" : "bg-white/25 ring-black/10"
      }`}
    >
      {/* colour hero with a corner code chip → name → controls */}
      <div
        style={{ backgroundColor: color.hex }}
        className="relative h-28 w-full border-b border-black/[0.06]"
      >
        <span
          style={{ backgroundColor: codeChipBg, color: color.hex }}
          className="absolute left-2 top-2 rounded-chip px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none shadow-sm"
        >
          {color.code}
        </span>
        <button
          type="button"
          onClick={act(() => setMeta.mutate({ code: color.code, input: { favorite: !color.favorite } }))}
          aria-label={color.favorite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={color.favorite}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95 ${
            color.favorite
              ? "bg-white text-red-500 shadow-sm"
              : light
                ? "bg-black/10 text-stone-900/60"
                : "bg-white/25 text-white/80"
          }`}
        >
          <Heart
            key={favPop.key}
            size={14}
            fill={color.favorite ? "currentColor" : "none"}
            className={favPop.className}
          />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`min-w-0 truncate font-display text-[15px] font-semibold leading-tight ${
              owned ? "text-stone-900" : "text-stone-400"
            }`}
          >
            {color.name}
          </span>
          {color.iridescent && (
            <Sparkles
              size={13}
              style={{ animationDelay: `${(parseInt(color.code, 10) % 7) * 0.5}s` }}
              className="shrink-0 animate-twinkle text-amber-500"
            />
          )}
        </div>
        <div className="mt-2">{Controls}</div>
      </div>
    </Link>
  );
}
