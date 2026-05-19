"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import HistoryFilters from "./HistoryFilters";
import HistoryRow from "./HistoryRow";
import {
  deletePreGradeSession,
  loadPreGradeHistory,
  renamePreGradeSession,
  type HistoryCeilingFilter,
} from "./history-utils";
import type { PreGradeSession } from "./lens-types";

export function HistoryLoadingSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading pre-grade history">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid animate-pulse grid-cols-[48px_minmax(190px,1fr)_minmax(260px,1.1fr)_auto_auto_auto] items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
        >
          <div className="h-[58px] w-[42px] rounded bg-deep" />
          <div className="h-4 w-40 rounded bg-deep" />
          <div className="space-y-2">
            <div className="h-3 w-56 rounded bg-deep" />
            <div className="h-3 w-48 rounded bg-deep" />
          </div>
          <div className="h-7 w-12 rounded bg-deep" />
          <div className="h-3 w-16 rounded bg-deep" />
          <div className="h-8 w-16 rounded bg-deep" />
        </div>
      ))}
    </div>
  );
}

export function HistoryEmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="text-lg font-semibold text-text">
        {hasFilters
          ? "No pre-grades match these filters."
          : "No pre-grades yet. Save one and it shows up here for one-click re-open."}
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-md border border-border bg-deep px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-text-2 transition-colors hover:border-owl/40 hover:text-owl"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export default function PreGradeHistoryClient() {
  const [search, setSearch] = useState("");
  const [ceiling, setCeiling] = useState<HistoryCeilingFilter>(null);
  const [rows, setRows] = useState<PreGradeSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = search.trim().length > 0 || ceiling !== null;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setCeiling(null);
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    loadPreGradeHistory({ search, ceiling })
      .then((result) => {
        if (!active) return;
        setRows(result.rows);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load pre-grade history.");
        setRows([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, ceiling]);

  async function handleRename(id: string, newName: string) {
    const result = await renamePreGradeSession({ id, newName });
    setRows((current) => current.map((row) => (row.id === id ? result.session : row)));
  }

  async function handleDelete(id: string) {
    await deletePreGradeSession({ id });
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Owl Lens</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Pre-grade history</h1>
          <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-wider text-text-2">
            {hasFilters ? `${rows.length} shown` : `${rows.length} saved`}
          </p>
        </div>
        <Link
          href="/admin/lens/pregrade"
          className="rounded-md border border-border bg-surface px-4 py-2.5 text-center font-mono text-sm font-bold uppercase text-text transition-colors hover:border-border-2 hover:text-owl"
        >
          Back to pre-grade
        </Link>
      </div>

      <div className="space-y-4">
        <HistoryFilters
          search={search}
          ceiling={ceiling}
          onSearchChange={handleSearchChange}
          onCeilingChange={setCeiling}
        />

        {error && (
          <div className="rounded-lg border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-text">
            {error}
          </div>
        )}

        {isLoading ? (
          <HistoryLoadingSkeleton />
        ) : rows.length === 0 ? (
          <HistoryEmptyState hasFilters={hasFilters} onClearFilters={clearFilters} />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <HistoryRow
                key={row.id}
                session={row}
                variant="full"
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
