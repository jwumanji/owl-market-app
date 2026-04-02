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
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search cards..."
        className="bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text
                   placeholder:text-text-3 focus:outline-none focus:border-[#E8A020]/40
                   w-[220px]"
      />

      {/* Set dropdown */}
      <select
        value={selectedSet}
        onChange={(e) => onSetChange(e.target.value)}
        className="bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text
                   focus:outline-none focus:border-[#E8A020]/40 cursor-pointer"
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
        className="bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-text
                   focus:outline-none focus:border-[#E8A020]/40 cursor-pointer"
      >
        <option value="value">Sort: Value</option>
        <option value="chg_1d">Sort: 24h</option>
        <option value="chg_7d">Sort: 7d</option>
        <option value="chg_30d">Sort: 30d</option>
      </select>

      {/* Rarity pills */}
      <div className="flex items-center gap-1.5">
        {RARITIES.map((r) => {
          const active = selectedRarities.includes(r);
          return (
            <button
              key={r}
              onClick={() => toggleRarity(r)}
              className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                active
                  ? "border-[#E8A020]/40 bg-[#E8A020]/10 text-owl"
                  : "border-border text-text-3 hover:text-text-2"
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
