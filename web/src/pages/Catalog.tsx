import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { isLowLevel, type ColorWithInventory, type OwnedFilter, type Sort } from "shared";
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
    default:
      return true;
  }
}

export function Catalog() {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [owned, setOwned] = useState<OwnedFilter>("all");
  const [sort, setSort] = useState<Sort>("code");
  const [view, setView] = useState<"grid" | "list">("grid");

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
    <div className="mx-auto flex min-h-full max-w-4xl flex-col">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-[#6b665e]/90 px-3 pb-2 pt-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-none text-stone-50">Oil Pastels</h1>
            <p className="mt-0.5 text-xs text-stone-300">
              {ownedCount}/{all.length} owned
              {lowCount > 0 && <> · {lowCount} low</>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-full border border-stone-400/70 px-3 py-1.5 text-xs font-medium text-stone-100"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">{user?.username}</span>
          </button>
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
      </header>

      <main className="flex-1 p-3">
        {isLoading && <p className="py-12 text-center text-sm text-slate-400">Loading…</p>}
        {isError && (
          <p className="py-12 text-center text-sm text-red-500">Couldn’t load the catalogue.</p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">No colours match.</p>
        )}

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visible.map((c) => (
              <ColorCard key={c.code} color={c} view="grid" />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-black/10">
            {visible.map((c) => (
              <ColorCard key={c.code} color={c} view="list" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
