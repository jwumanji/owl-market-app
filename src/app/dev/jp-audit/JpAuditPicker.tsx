"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface PickerCard {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  setCode: string | null;
}

// Searchable card list for the JP price audit page. SSR links work without JS;
// only the filter box is client-stateful.
export default function JpAuditPicker({
  cards,
  selectedId,
}: {
  cards: PickerCard[];
  selectedId?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      [c.name, c.card_number, c.rarity, c.setCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [q, cards]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="filter cards…"
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 outline-none focus:border-owl"
      />
      <div className="text-xs uppercase tracking-wider text-text-3">
        showing {filtered.length} / {cards.length}
      </div>
      <div className="max-h-[72vh] overflow-y-auto rounded border border-border">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-text-2">no matches</p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/dev/jp-audit?card=${encodeURIComponent(c.id)}`}
                    className={`block border-b border-border px-3 py-2 transition-colors hover:bg-surf2 ${
                      active ? "bg-surf2 text-owl" : "text-text"
                    }`}
                  >
                    <span className="block truncate text-sm">{c.name ?? "(unnamed)"}</span>
                    <span className="mt-0.5 block truncate text-xs text-text-2">
                      {[c.setCode, c.card_number, c.rarity].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
