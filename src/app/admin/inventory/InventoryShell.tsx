"use client";

import { useMemo, useState } from "react";
import InventoryTabs, { InventoryRow } from "./InventoryTabs";

type InventoryStatus = "new" | "grading" | "sale" | "sold";
type StatusFilter = InventoryStatus | "all";

const STATUS_LABELS: Record<InventoryStatus, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  sold: "Sold",
};

export default function InventoryShell({ items }: { items: InventoryRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const byStatus = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.status] += item.quantity;
        return acc;
      },
      { new: 0, grading: 0, sale: 0, sold: 0 }
    );
  }, [items]);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as InventoryStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              statusFilter === status
                ? "border-owl bg-owl/10"
                : "border-border bg-surface hover:border-border-2 hover:bg-surf2"
            }`}
          >
            <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">
              {STATUS_LABELS[status]}
            </div>
            <div className="mt-2 text-3xl font-bold text-text">{byStatus[status]}</div>
          </button>
        ))}
      </div>

      <InventoryTabs
        items={items}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
    </>
  );
}
