"use client";

import { SetInfo, SortKey } from "@/lib/types";

const RARITIES = ["MR", "SP", "SEC", "TR", "AA", "SR", "R", "L", "UC", "C"] as const;

interface FilterBarProps {
  sets: SetInfo[];
  search: string;
  onSearchChange: (v: string) => void;
  selectedSet: string;
  onSetChange: (v: string) => void;
  selectedRarities: string[];
  onRaritiesChange: (v: string[]) => void;
  sortBy: SortKey;
  onSortChange: (v: SortKey) => void;
}

export default function FilterBar({
  sets,
  search,
  onSearchChange,
  selectedSet,
  onSetChange,
  selectedRarities,
  onRaritiesChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  function toggleRarity(r: string) {
    onRaritiesChange(
      selectedRarities.includes(r)
        ? selectedRarities.filter((x) => x !== r)
        : [...selectedRarities, r]
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 mb-4">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search cards..."
        className="bg-bg-2 border-[1.5px] border-ink rounded-c-pill px-4 py-[9px] text-[13px] font-mono-2 text-ink
                   placeholder:text-ink-3 focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/30
                   w-[220px] transition-colors"
      />

      {/* Set dropdown */}
      <select
        value={selectedSet}
        onChange={(e) => onSetChange(e.target.value)}
        className="bg-bg-2 border-[1.5px] border-ink rounded-c-pill px-4 py-[9px] text-[13px] font-grotesk font-semibold text-ink
                   focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 cursor-pointer transition-colors"
      >
        <option value="all">All Sets</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code ? `[${s.code}] ` : ""}{s.name}
          </option>
        ))}
      </select>

      {/* Sort dropdown */}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        className="bg-bg-2 border-[1.5px] border-ink rounded-c-pill px-4 py-[9px] text-[13px] font-grotesk font-semibold text-ink
                   focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 cursor-pointer transition-colors"
      >
        <option value="value">Sort: Value</option>
        <option value="chg_1d">Sort: 24h</option>
        <option value="chg_7d">Sort: 7d</option>
        <option value="chg_30d">Sort: 30d</option>
      </select>

      {/* Rarity toggle chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RARITIES.map((r) => {
          const active = selectedRarities.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggleRarity(r)}
              className={`px-[11px] py-[5px] rounded-c-pill text-[11px] font-mono-2 font-semibold tracking-[0.04em] border-[1.5px] cursor-pointer transition-all ${
                active
                  ? "border-ink bg-ink text-bg"
                  : "border-ink-3 bg-bg-2 text-ink-2 hover:border-ink hover:text-ink"
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}
