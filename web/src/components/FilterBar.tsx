import { LayoutGrid, List, Search } from "lucide-react";
import type { OwnedFilter, Sort } from "shared";

interface Props {
  q: string;
  owned: OwnedFilter;
  sort: Sort;
  view: "grid" | "list";
  onChange: (patch: Partial<{ q: string; owned: OwnedFilter; sort: Sort; view: "grid" | "list" }>) => void;
}

const OWNED_OPTIONS: { value: OwnedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "missing", label: "Missing" },
  { value: "low", label: "Low" },
];

export function FilterBar({ q, owned, sort, view, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search name, code, pigment…"
            inputMode="search"
            className="w-full rounded-full border border-stone-300 bg-white py-2 pl-9 pr-3 text-base text-stone-800 placeholder:text-stone-400 outline-none focus:border-stone-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => onChange({ sort: e.target.value as Sort })}
          className="rounded-full border border-stone-300 bg-white px-3 py-2 text-base text-stone-800 outline-none"
          aria-label="Sort order"
        >
          <option value="code">Code</option>
          <option value="name">Name</option>
          <option value="hue">Hue</option>
        </select>
        <button
          type="button"
          onClick={() => onChange({ view: view === "grid" ? "list" : "grid" })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700"
          aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
        >
          {view === "grid" ? <List size={18} /> : <LayoutGrid size={18} />}
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {OWNED_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange({ owned: o.value })}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
              owned === o.value
                ? "bg-stone-800 text-stone-50"
                : "border border-stone-300 bg-white text-stone-700"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
