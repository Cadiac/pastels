import { useEffect, useMemo, useState } from "react";
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

function loadPrefs(): { owned: OwnedFilter; sort: Sort; view: "grid" | "list" } {
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
  };
}

export function Catalog() {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [owned, setOwned] = useState<OwnedFilter>(() => loadPrefs().owned);
  const [sort, setSort] = useState<Sort>(() => loadPrefs().sort);
  const [view, setView] = useState<"grid" | "list">(() => loadPrefs().view);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ owned, sort, view }));
  }, [owned, sort, view]);

  // Collapse the title row when scrolled, with hysteresis so shrinking the
  // header (which shifts scrollY) can't flip it right back.
  useEffect(() => {
    const onScroll = () => setCollapsed((c) => (c ? window.scrollY > 16 : window.scrollY > 72));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch the full catalogue (server sorts); search/owned are filtered locally.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["colors", { sort }],
    queryFn: () => api.colors({ sort }),
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
      <header className="sticky top-0 z-10 border-b border-black/10 bg-[#f3ebd5]/90 backdrop-blur">
        <div className="mx-auto max-w-[1280px] px-3 pb-2 pt-3">
          {/* title row — collapses away on scroll so the sticky header stays slim */}
          <div
            aria-hidden={collapsed}
            className={`grid transition-all duration-300 ${
              collapsed ? "grid-rows-[0fr] opacity-0" : "mb-2 grid-rows-[1fr] opacity-100"
            }`}
          >
            <div className="flex items-center justify-between overflow-hidden">
              <div>
                <h1 className="text-lg font-bold leading-none text-stone-900">Oil Pastels - Sennelier</h1>
                <p className="mt-0.5 text-xs text-stone-500">
                  {ownedCount}/{all.length} owned
                  {lowCount > 0 && <> · {lowCount} low</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                tabIndex={collapsed ? -1 : 0}
                className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">{user?.username}</span>
              </button>
            </div>
          </div>
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

      <main className="mx-auto w-full max-w-[1280px] flex-1 p-3">
        {isLoading && <p className="py-12 text-center text-sm text-stone-500">Loading…</p>}
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
