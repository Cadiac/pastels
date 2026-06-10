import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { hexToHue, hueDistance, type ColorWithInventory } from "shared";
import { api } from "../api/client";

/** Catalogue colours whose hue sits close enough to a harmony target. */
const TOLERANCE = 20;

const ROWS: { name: string; offsets: number[] }[] = [
  { name: "Complementary", offsets: [180] },
  { name: "Analogous", offsets: [-30, 30] },
  { name: "Triadic", offsets: [120, 240] },
];

function pick(
  all: ColorWithInventory[],
  selfId: string,
  targetHue: number,
  count: number,
): ColorWithInventory[] {
  return all
    .filter((c) => c.id !== selfId && hexToHue(c.hex) < 360)
    .map((c) => ({ c, d: hueDistance(hexToHue(c.hex), targetHue) }))
    .filter((x) => x.d <= TOLERANCE)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.c);
}

/** Colour-theory companions, picked from the colour's own brand catalogue. */
export function Harmonies({
  selfId,
  catalogue,
  hex,
}: {
  selfId: string;
  catalogue: string;
  hex: string;
}) {
  // Same key shape as the catalogue page, so this usually hits the cache.
  const { data } = useQuery({
    queryKey: ["colors", { sort: "code", catalogue }],
    queryFn: () => api.colors({ sort: "code", catalogue }),
  });

  const hue = hexToHue(hex);
  if (!data || hue >= 360) return null; // neutrals have no meaningful harmonies

  const rows = ROWS.map(({ name, offsets }) => {
    const perTarget = offsets.length === 1 ? 4 : 2;
    const seen = new Set<string>();
    const colors = offsets
      .flatMap((o) => pick(data, selfId, (hue + o + 360) % 360, perTarget))
      .filter((c) => !seen.has(c.id) && seen.add(c.id));
    return { name, colors };
  }).filter((r) => r.colors.length > 0);

  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
        Harmonies
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="mb-1.5 text-xs text-stone-500">{row.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {row.colors.map((c) => {
                const owned = !!c.inventory;
                return (
                  <Link
                    key={c.id}
                    to={`/c/${c.id}`}
                    title={c.name}
                    className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition active:scale-95 ${
                      owned ? "border-stone-300 bg-white" : "border-stone-200 bg-white/40 opacity-70"
                    }`}
                  >
                    <span
                      style={{ backgroundColor: c.hex }}
                      className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10"
                    />
                    <span className="font-mono text-xs font-semibold text-stone-700">{c.code}</span>
                    {owned && <Check size={12} className="text-stone-500" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
