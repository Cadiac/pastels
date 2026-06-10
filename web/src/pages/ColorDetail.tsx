import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, Heart, Sparkles } from "lucide-react";
import { isLight, LEVEL_META, type HistoryEvent, type Level } from "shared";
import { api } from "../api/client";
import { LevelChip } from "../components/LevelChip";
import { QuantityStepper } from "../components/QuantityStepper";
import { ValueScale } from "../components/ValueScale";
import { Harmonies } from "../components/Harmonies";
import { useSetInventory, useSetMeta } from "../api/hooks";
import { useThemeColor } from "../useThemeColor";
import { usePop } from "../usePop";

const TRANSPARENCY: Record<string, string> = {
  T: "Transparent",
  O: "Opaque",
  "T/O": "Semi-opaque",
};
const LIGHTFAST: Record<string, string> = {
  I: "Excellent (I)",
  II: "Very good (II)",
  III: "Moderate (III)",
};

function describeEvent(e: HistoryEvent): string {
  if (e.type === "add") return `+${e.amount} ${e.amount === 1 ? "stick" : "sticks"}`;
  if (e.type === "remove") return `−${e.amount} ${e.amount === 1 ? "stick" : "sticks"}`;
  return `Remaining → ${e.level ? LEVEL_META[e.level].label : "?"}`;
}

/** SQLite's UTC `YYYY-MM-DD HH:MM:SS` rendered in the viewer's locale. */
function formatAt(at: string): string {
  return new Date(`${at.replace(" ", "T")}Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ColorDetail() {
  const { code = "" } = useParams();
  const setInventory = useSetInventory();
  const setMeta = useSetMeta();
  // null = not editing; the textarea otherwise shows the saved notes.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const { data: color, isLoading, isError } = useQuery({
    queryKey: ["color", code],
    queryFn: () => api.color(code),
  });
  const { data: history } = useQuery({
    queryKey: ["history", code],
    queryFn: () => api.history(code),
    enabled: !!code,
  });
  // Blend Safari's top bar into the colour hero while this page is open.
  useThemeColor(color?.hex);
  const favPop = usePop(color?.favorite);
  const wantPop = usePop(color?.want);

  if (isLoading)
    return (
      <div className="min-h-full w-full animate-pulse">
        <div className="h-44 w-full bg-stone-200/80" />
        <div className="mx-auto grid w-full max-w-5xl gap-x-10 gap-y-6 p-4 md:grid-cols-2 md:p-6">
          <div className="flex flex-col gap-6">
            <div className="h-10 rounded-full bg-white/60" />
            <div className="h-36 rounded-card bg-white/60" />
            <div className="h-16 max-w-[260px] rounded-card bg-white/60" />
          </div>
          <div className="h-44 rounded-card bg-white/40" />
        </div>
      </div>
    );
  if (isError || !color)
    return <p className="p-8 text-center text-sm text-red-300">Colour not found.</p>;

  const quantity = color.inventory?.quantity ?? 0;
  const level: Level = color.inventory?.level ?? "full";
  const fg = isLight(color.hex) ? "#1c1917" : "#ffffff"; // contrast text on the colour hero

  const setQuantity = (n: number) =>
    setInventory.mutate({
      code: color.code,
      // Removing a stick discards the part-used one, so the rest are full again;
      // adding a stick keeps the current working level.
      input: { quantity: n, level: n <= 0 ? null : n < quantity ? "full" : level },
    });
  const cycle = (next: Level) =>
    setInventory.mutate({ code: color.code, input: { quantity: quantity || 1, level: next } });

  const saveNotes = () => {
    if (notesDraft === null) return;
    const trimmed = notesDraft.trim();
    if (trimmed !== (color.notes ?? ""))
      setMeta.mutate({ code: color.code, input: { notes: trimmed || null } });
    setNotesDraft(null);
  };

  const TOGGLE =
    "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  return (
    <div className="relative min-h-full w-full text-stone-800">
      {/* paints the rubber-band overscroll area above the page in the hero
          colour, so bouncing at the top never reveals a cream gap */}
      <div
        aria-hidden
        style={{ backgroundColor: color.hex }}
        className="absolute inset-x-0 -top-[50rem] h-[50rem]"
      />
      {/* colour hero — the chosen colour, with name and a popping ID chip */}
      <div style={{ backgroundColor: color.hex, color: fg }} className="relative pb-6 pt-3">
        {/* hero is full-bleed; its content lines up with the centred column below */}
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
          <Link
            to="/"
            className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium opacity-90 transition active:bg-black/10"
          >
            <ChevronLeft size={18} /> Back
          </Link>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 font-display text-3xl font-bold leading-tight">
                {color.name}
                {color.iridescent && <Sparkles size={20} className="shrink-0 animate-twinkle opacity-90" />}
              </h1>
              <p className="mt-0.5 text-sm opacity-80">{color.names.fr}</p>
              {color.new && (
                <span className="mt-2 inline-block rounded-full bg-black/15 px-2 py-0.5 text-xs font-semibold">
                  New
                </span>
              )}
            </div>

            <div
              style={{ backgroundColor: fg, color: color.hex }}
              className="shrink-0 rounded-card px-3.5 py-2 text-center shadow-sm"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">No.</div>
              <div className="font-mono text-3xl font-bold leading-none">{color.code}</div>
            </div>
          </div>
        </div>
      </div>

      {/* content — single column on phones, two columns on tablet+.
          The hero's colour bleeds softly into the page, like pigment on paper. */}
      <div
        style={{
          // Drop-shadow-like falloff: strong right under the hero, gone within
          // ~160px — eased stops so it doesn't read as a page-long gradient.
          // Opaque pastel mixes (not alpha veils): dark hues like ultramarine
          // would otherwise grey out against the warm cream.
          background: `linear-gradient(to bottom, ${[
            `color-mix(in oklab, ${color.hex} 22%, #f3ebd5)`,
            `color-mix(in oklab, ${color.hex} 9%, #f3ebd5) 56px`,
            `color-mix(in oklab, ${color.hex} 3%, #f3ebd5) 110px`,
            `#f3ebd5 160px`,
          ].join(", ")})`,
        }}
      >
      <div className="mx-auto grid w-full max-w-5xl animate-rise-in gap-x-10 gap-y-6 p-4 md:grid-cols-2 md:p-6 lg:gap-x-16">
        <div className="flex flex-col gap-6">
          {/* Favourite / want list toggles */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMeta.mutate({ code: color.code, input: { favorite: !color.favorite } })}
              aria-pressed={color.favorite}
              className={`${TOGGLE} ${
                color.favorite
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <Heart
                key={favPop.key}
                size={15}
                fill={color.favorite ? "currentColor" : "none"}
                className={favPop.className}
              />
              Favourite
            </button>
            <button
              type="button"
              onClick={() => setMeta.mutate({ code: color.code, input: { want: !color.want } })}
              aria-pressed={color.want}
              className={`${TOGGLE} ${
                color.want
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <Bookmark
                key={wantPop.key}
                size={15}
                fill={color.want ? "currentColor" : "none"}
                className={wantPop.className}
              />
              Want
            </button>
          </div>

          {/* Inventory controls */}
          <section className="rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 text-sm font-semibold text-stone-700">Your inventory</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Sticks owned</span>
              <QuantityStepper value={quantity} onChange={setQuantity} />
            </div>
            {quantity > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-4">
                <span className="text-sm text-stone-600">Remaining</span>
                <LevelChip level={level} onCycle={cycle} size="md" />
              </div>
            )}
          </section>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
              Swatch
            </div>
            <img
              src={`/swatches/${color.code}.png`}
              alt={`${color.name} swatch`}
              className="h-16 w-full max-w-[260px] rounded-card bg-white object-cover ring-1 ring-black/10"
            />
          </div>

          <ValueScale hex={color.hex} />

          <Harmonies code={color.code} hex={color.hex} />
        </div>

        <div className="flex flex-col gap-6">
          {/* Metadata */}
          <dl className="divide-y divide-black/10 text-sm">
            <Row label="Transparency" value={TRANSPARENCY[color.transparency] ?? color.transparency} />
            <Row
              label="Lightfastness"
              value={color.lightfastness ? (LIGHTFAST[color.lightfastness] ?? color.lightfastness) : "—"}
            />
            <Row label="Pigments" value={color.pigments.length ? color.pigments.join(", ") : "—"} />
            <Row label="Hex" value={<span className="font-mono">{color.hex.toUpperCase()}</span>} />
          </dl>

          {/* Notes */}
          <section className="rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-stone-700">Notes</h2>
              {setMeta.isPending && <span className="text-xs text-stone-400">Saving…</span>}
            </div>
            <textarea
              value={notesDraft ?? color.notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Add a note…"
              className="w-full resize-y rounded-chip border border-stone-200 bg-stone-50 p-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400"
            />
          </section>

          {/* Usage history */}
          {history && history.length > 0 && (
            <section>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
                History
              </div>
              <ul className="divide-y divide-black/5 overflow-hidden rounded-card bg-white text-sm shadow-sm ring-1 ring-black/5">
                {history.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between px-3.5 py-2">
                    <span className="font-medium text-stone-700">{describeEvent(e)}</span>
                    <span className="text-xs text-stone-400">{formatAt(e.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-800">{value}</dd>
    </div>
  );
}
