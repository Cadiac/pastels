import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { colorDistance, type ColorWithInventory } from "shared";
import { api } from "../api/client";

/**
 * OKLab distance under which a colour counts as an equivalent. Generous of
 * print noise (the hexes are sampled from differently printed charts) but
 * tight enough that a colour with no real counterpart matches nothing.
 */
const THRESHOLD = 0.06;

/** The nearest match to this colour in each of the other brand catalogues. */
export function SimilarColors({ self }: { self: ColorWithInventory }) {
  const { data: colors } = useQuery({
    queryKey: ["colors", { sort: "code" }],
    queryFn: () => api.colors({ sort: "code" }),
  });
  const { data: catalogues } = useQuery({ queryKey: ["catalogues"], queryFn: api.catalogues });

  if (!colors || !catalogues) return null;

  const best = new Map<string, { c: ColorWithInventory; d: number }>();
  for (const c of colors) {
    // Metallics only match metallics: a gold's sampled hex is just a yellow.
    if (c.catalogue === self.catalogue || c.iridescent !== self.iridescent) continue;
    const d = colorDistance(c.hex, self.hex);
    if (d > THRESHOLD) continue;
    const cur = best.get(c.catalogue);
    if (!cur || d < cur.d) best.set(c.catalogue, { c, d });
  }
  const matches = [...best.values()].sort((a, b) => a.d - b.d);
  if (matches.length === 0) return null;

  const shortName = (id: string) => catalogues.find((k) => k.id === id)?.shortName ?? id;

  return (
    <section>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
        Similar in other brands
      </div>
      <ul className="divide-y divide-black/5 overflow-hidden rounded-card bg-white text-sm shadow-sm ring-1 ring-black/5">
        {matches.map(({ c }) => {
          const owned = !!c.inventory;
          return (
            <li key={c.id}>
              <Link
                to={`/c/${c.id}`}
                className={`flex items-center gap-2.5 px-3.5 py-2 transition active:bg-stone-50 ${
                  owned ? "" : "opacity-70"
                }`}
              >
                <span
                  style={{ backgroundColor: c.hex }}
                  className="h-6 w-6 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-stone-700">
                  {c.name}
                </span>
                <span className="shrink-0 text-xs text-stone-400">{shortName(c.catalogue)}</span>
                <span className="shrink-0 font-mono text-xs font-semibold text-stone-600">
                  {c.code}
                </span>
                {owned && <Check size={13} className="shrink-0 text-stone-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
