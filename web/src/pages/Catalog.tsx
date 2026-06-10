import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import {
  isLowLevel,
  OwnedFilterSchema,
  SortSchema,
  type ColorWithInventory,
  type OwnedFilter,
  type Sort,
} from "shared";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { FilterBar } from "../components/FilterBar";
import { ColorCard } from "../components/ColorCard";
import { RainbowRibbon } from "../components/Rainbow";

function matchesQuery(c: ColorWithInventory, q: string): boolean {
  if (!q) return true;
  const hay = [c.code, c.name, ...Object.values(c.names), ...c.pigments].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesOwned(c: ColorWithInventory, owned: OwnedFilter): boolean {
  switch (owned) {
    case "owned":
      return !!c.inventory;
    case "missing":
      return !c.inventory;
    case "low":
      return !!c.inventory && isLowLevel(c.inventory.level);
    case "favorites":
      return c.favorite;
    case "wanted":
      return c.want;
    default:
      return true;
  }
}

// Sort/view/filter survive reloads via localStorage (validated, so stale or
// hand-edited values fall back to defaults instead of crashing).
const PREFS_KEY = "pastels.prefs";

function loadPrefs(): {
  owned: OwnedFilter;
  sort: Sort;
  view: "grid" | "list";
  catalogue: string;
} {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    /* corrupt JSON — use defaults */
  }
  return {
    owned: OwnedFilterSchema.catch("all").parse(raw.owned),
    sort: SortSchema.catch("code").parse(raw.sort),
    view: raw.view === "list" ? "list" : "grid",
    catalogue: typeof raw.catalogue === "string" ? raw.catalogue : "sennelier",
  };
}

export function Catalog() {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [owned, setOwned] = useState<OwnedFilter>(() => loadPrefs().owned);
  const [sort, setSort] = useState<Sort>(() => loadPrefs().sort);
  const [view, setView] = useState<"grid" | "list">(() => loadPrefs().view);
  const [catalogue, setCatalogue] = useState(() => loadPrefs().catalogue);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ owned, sort, view, catalogue }));
  }, [owned, sort, view, catalogue]);

  const { data: catalogues } = useQuery({
    queryKey: ["catalogues"],
    queryFn: api.catalogues,
  });
  // A stale stored pref (renamed/removed catalogue) falls back to the first.
  useEffect(() => {
    if (catalogues?.length && !catalogues.some((c) => c.id === catalogue))
      setCatalogue(catalogues[0].id);
  }, [catalogues, catalogue]);

  // The filter bar "lifts" (shadow + border) only once it's actually stuck:
  // a zero-height sentinel right above it leaves the viewport exactly then.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Fetch the full catalogue (server sorts); search/owned are filtered locally.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["colors", { sort, catalogue }],
    queryFn: () => api.colors({ sort, catalogue }),
  });

  const all = data ?? [];
  const ownedCount = all.filter((c) => c.inventory).length;
  const lowCount = all.filter((c) => c.inventory && isLowLevel(c.inventory.level)).length;

  const visible = useMemo(
    () => all.filter((c) => matchesQuery(c, q) && matchesOwned(c, owned)),
    [all, q, owned],
  );

  return (
    <div className="flex min-h-full flex-col">
      <RainbowRibbon />
      {/* title row scrolls away with the page; only the filter bar below is sticky.
          Scrolling does the "collapse" natively, so it never janks. */}
      <div className="mx-auto w-full max-w-[1280px] px-3 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold leading-none text-stone-900">
              Oil Pastels
            </h1>
            <p className="mt-0.5 text-xs text-stone-500">
              {ownedCount}/{all.length} owned
              {lowCount > 0 && <> · {lowCount} low</>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">{user?.username}</span>
          </button>
        </div>

        {/* Brand catalogue switcher — scrolls away with the title row. */}
        {catalogues && catalogues.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {catalogues.map((c) => {
              const active = c.id === catalogue;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatalogue(c.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                    active
                      ? "border-stone-800 bg-stone-800 text-stone-50"
                      : "border-stone-300 bg-white/60 text-stone-600"
                  }`}
                >
                  {c.shortName}
                  <span className={active ? "opacity-70" : "text-stone-400"}>
                    {c.owned}/{c.total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={sentinelRef} aria-hidden />
      <header
        className={`sticky top-0 z-10 border-b bg-[#f3ebd5] transition-[box-shadow,border-color] duration-200 ${
          stuck ? "border-black/10 shadow-md shadow-stone-900/5" : "border-transparent"
        }`}
      >
        <div className="mx-auto max-w-[1280px] px-3 py-2">
          <FilterBar
            q={q}
            owned={owned}
            sort={sort}
            view={view}
            onChange={(p) => {
              if (p.q !== undefined) setQ(p.q);
              if (p.owned !== undefined) setOwned(p.owned);
              if (p.sort !== undefined) setSort(p.sort);
              if (p.view !== undefined) setView(p.view);
            }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 animate-rise-in p-3">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-card bg-white/60 ring-1 ring-black/5">
                <div className="h-28 w-full bg-stone-200/70" />
                <div className="flex flex-col gap-2 p-2.5">
                  <div className="h-3.5 w-2/3 rounded-full bg-stone-200/80" />
                  <div className="h-6 w-16 rounded-full bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        )}
        {isError && (
          <p className="py-12 text-center text-sm text-red-500">Couldn’t load the catalogue.</p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <p className="py-12 text-center text-sm text-stone-500">No colours match.</p>
        )}

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((c) => (
              <ColorCard key={c.code} color={c} view="grid" />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-black/10">
            {visible.map((c) => (
              <ColorCard key={c.code} color={c} view="list" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
