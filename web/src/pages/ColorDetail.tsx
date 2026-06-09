import { type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Sparkles } from "lucide-react";
import { isLight, type Level } from "shared";
import { api } from "../api/client";
import { LevelChip } from "../components/LevelChip";
import { QuantityStepper } from "../components/QuantityStepper";
import { ValueScale } from "../components/ValueScale";
import { useSetInventory } from "../api/hooks";

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

export function ColorDetail() {
  const { code = "" } = useParams();
  const setInventory = useSetInventory();
  const { data: color, isLoading, isError } = useQuery({
    queryKey: ["color", code],
    queryFn: () => api.color(code),
  });

  if (isLoading) return <p className="p-8 text-center text-sm text-stone-300">Loading…</p>;
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

  return (
    <div className="mx-auto min-h-full w-full max-w-[1280px] bg-[#f3ebd5] text-stone-800">
      {/* colour hero — the chosen colour, with name and a popping ID chip */}
      <div style={{ backgroundColor: color.hex, color: fg }} className="px-4 pb-6 pt-3">
        <Link
          to="/"
          className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium opacity-90 transition active:bg-black/10"
        >
          <ChevronLeft size={18} /> Back
        </Link>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight">
              {color.name}
              {color.iridescent && <Sparkles size={20} className="shrink-0 opacity-90" />}
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

      {/* content — single column on phones, two columns on tablet+ */}
      <div className="grid gap-x-10 gap-y-6 p-4 md:grid-cols-2 md:p-6 lg:gap-x-16">
        <div className="flex flex-col gap-6">
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
        </div>

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
