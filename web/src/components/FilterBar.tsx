import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check, ChevronDown, LayoutGrid, List, Search, X } from "lucide-react";
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

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "name", label: "Name" },
  { value: "hue", label: "Hue" },
];

const CTRL =
  "h-10 shrink-0 rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition";

export function FilterBar({ q, owned, sort, view, onChange }: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort";

  // Close the sort menu on any pointer-down outside it.
  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: PointerEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [sortOpen]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* search */}
        <div className="relative flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            value={q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search name, code, pigment…"
            inputMode="search"
            className="h-10 w-full rounded-full border border-stone-300 bg-white pl-10 pr-10 text-base text-stone-800 shadow-sm outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-4 focus:ring-stone-200"
          />
          {q && (
            <button
              type="button"
              onClick={() => onChange({ q: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* sort */}
        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            aria-label="Sort order"
            aria-expanded={sortOpen}
            className={`${CTRL} flex items-center gap-1.5 px-3 text-sm font-medium ${
              sortOpen ? "border-stone-400 ring-4 ring-stone-200" : ""
            }`}
          >
            <ArrowDownUp size={14} className="text-stone-400" />
            {sortLabel}
            <ChevronDown
              size={14}
              className={`text-stone-400 transition-transform ${sortOpen ? "rotate-180" : ""}`}
            />
          </button>
          {sortOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-36 overflow-hidden rounded-card border border-stone-200 bg-white p-1 shadow-lg">
              <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                Sort by
              </div>
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange({ sort: o.value });
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-chip px-3 py-2 text-sm ${
                    sort === o.value
                      ? "bg-stone-100 font-semibold text-stone-900"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {o.label}
                  {sort === o.value && <Check size={15} className="text-stone-700" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* view toggle */}
        <button
          type="button"
          onClick={() => onChange({ view: view === "grid" ? "list" : "grid" })}
          className={`${CTRL} flex w-10 items-center justify-center`}
          aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
        >
          {view === "grid" ? <List size={18} /> : <LayoutGrid size={18} />}
        </button>
      </div>

      {/* owned filter chips */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
        {OWNED_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange({ owned: o.value })}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              owned === o.value
                ? "bg-stone-800 text-stone-50 shadow-sm"
                : "border border-stone-300 bg-white text-stone-600 hover:text-stone-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
