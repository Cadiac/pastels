import { type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Sparkles } from "lucide-react";
import { type Level } from "shared";
import { api } from "../api/client";
import { SwatchImg } from "../components/SwatchImg";
import { HexDot } from "../components/HexDot";
import { LevelChip } from "../components/LevelChip";
import { QuantityStepper } from "../components/QuantityStepper";
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

  if (isLoading) return <p className="p-8 text-center text-sm text-slate-400">Loading…</p>;
  if (isError || !color)
    return <p className="p-8 text-center text-sm text-red-500">Colour not found.</p>;

  const quantity = color.inventory?.quantity ?? 0;
  const level: Level = color.inventory?.level ?? "full";

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
    <div className="mx-auto max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-200 bg-white/90 px-2 py-2 backdrop-blur">
        <Link
          to="/"
          className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium text-slate-600 active:bg-slate-100"
        >
          <ChevronLeft size={18} /> Back
        </Link>
      </header>

      <SwatchImg
        code={color.code}
        hex={color.hex}
        name={color.name}
        className="h-40 w-full object-cover"
      />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              {color.name}
              {color.iridescent && <Sparkles size={18} className="text-amber-500" />}
            </h1>
            <p className="text-sm text-slate-500">{color.names.fr}</p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm text-slate-500">
            {color.code}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {color.new && <Badge className="bg-sky-100 text-sky-700">New</Badge>}
        </div>

        {/* Inventory controls */}
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Your inventory</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Sticks owned</span>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
          {quantity > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Remaining</span>
              <LevelChip level={level} onCycle={cycle} size="md" />
            </div>
          )}
        </section>

        {/* Metadata */}
        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          <Row label="Transparency" value={TRANSPARENCY[color.transparency] ?? color.transparency} />
          <Row
            label="Lightfastness"
            value={color.lightfastness ? (LIGHTFAST[color.lightfastness] ?? color.lightfastness) : "—"}
          />
          <Row label="Pigments" value={color.pigments.length ? color.pigments.join(", ") : "—"} />
          <Row
            label="Hex"
            value={
              <span className="inline-flex items-center gap-2 leading-none">
                <HexDot hex={color.hex} size={14} />
                <span className="font-mono">{color.hex.toUpperCase()}</span>
              </span>
            }
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
  );
}
