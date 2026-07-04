"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HistoryRow from "./HistoryRow";
import {
  loadPreGradeHistory,
  renamePreGradeSession,
} from "./history-utils";
import type { PreGradeSession } from "./lens-types";

export default function PreGradeHistorySection() {
  const [rows, setRows] = useState<PreGradeSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadPreGradeHistory({ search: "", ceiling: null })
      .then((result) => {
        if (!active) return;
        setRows(result.rows.slice(0, 5));
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleRename(id: string, newName: string) {
    const result = await renamePreGradeSession({ id, newName });
    setRows((current) => current.map((row) => (row.id === id ? result.session : row)));
  }

  if (isLoading) {
    return (
      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-deep" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[74px] animate-pulse rounded-md bg-deep" />
          ))}
        </div>
      </section>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-owl">Recent pre-grades</p>
          <h2 className="mt-1 text-xl font-semibold text-text">Latest saved measurements</h2>
        </div>
        <Link
          href="/admin/lens/pregrade/history"
          className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-text-2 transition-colors hover:border-border-2 hover:text-owl"
        >
          View all
        </Link>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <HistoryRow
            key={row.id}
            session={row}
            variant="compact"
            onRename={handleRename}
          />
        ))}
      </div>
    </section>
  );
}
