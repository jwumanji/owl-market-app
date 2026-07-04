"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HISTORY_CEILING_FILTERS,
  createDebouncedSearchDispatcher,
  type HistoryCeilingFilter,
} from "./history-utils";

type HistoryFiltersProps = {
  search: string;
  ceiling: HistoryCeilingFilter;
  onSearchChange: (value: string) => void;
  onCeilingChange: (value: HistoryCeilingFilter) => void;
};

const ACTIVE_TONE_CLASSES: Record<"gain" | "owl" | "loss", string> = {
  gain: "border-gain/50 bg-gain/10 text-gain shadow-[0_0_0_1px_rgba(0,214,143,0.12)]",
  owl: "border-owl/50 bg-owl/10 text-owl shadow-[0_0_0_1px_rgba(232,160,32,0.12)]",
  loss: "border-loss/50 bg-loss/10 text-loss shadow-[0_0_0_1px_rgba(255,69,96,0.12)]",
};

export default function HistoryFilters({
  search,
  ceiling,
  onSearchChange,
  onCeilingChange,
}: HistoryFiltersProps) {
  const [draftSearch, setDraftSearch] = useState(search);
  const dispatchSearch = useMemo(
    () =>
      createDebouncedSearchDispatcher({
        onSearchChange,
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (handle) => window.clearTimeout(handle),
      }),
    [onSearchChange]
  );

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  useEffect(() => {
    dispatchSearch(draftSearch);
    return dispatchSearch.cancel;
  }, [draftSearch, dispatchSearch]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Search pre-grades</span>
        <input
          type="search"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="Search by card name"
          className="w-full rounded-md border border-border bg-deep px-3.5 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-3 focus:border-owl/50"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {HISTORY_CEILING_FILTERS.map((filter) => {
          const active = ceiling === filter.value;
          const activeClass = filter.tone
            ? ACTIVE_TONE_CLASSES[filter.tone]
            : "border-border-2 bg-surf2 text-text";

          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => onCeilingChange(filter.value)}
              className={`rounded-md border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? activeClass
                  : "border-border bg-deep text-text-2 hover:border-border-2 hover:text-text"
              }`}
              aria-pressed={active}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
