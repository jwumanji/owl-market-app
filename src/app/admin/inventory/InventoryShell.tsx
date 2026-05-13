"use client";

import { useMemo, useState } from "react";
import InventoryTabs, { InventoryRow } from "./InventoryTabs";
import type { CustomerOrderSummary } from "../orders/order-types";

type InventoryStatus = "new" | "grading" | "sale" | "ship" | "sold";
type StatusFilter = InventoryStatus | "all";

const STATUS_LABELS: Record<InventoryStatus, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

export default function InventoryShell({
  items,
  orders = [],
  ordersError = null,
}: {
  items: InventoryRow[];
  orders?: CustomerOrderSummary[];
  ordersError?: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [liveItems, setLiveItems] = useState(items);
  const openOrderCount = orders.filter((order) => !order.marked_shipped).length;
  const shippedOrderCount = orders.length - openOrderCount;

  const byStatus = useMemo(() => {
    return liveItems.reduce(
      (acc, item) => {
        acc[item.status] += item.quantity;
        return acc;
      },
      { new: 0, grading: 0, sale: 0, ship: 0, sold: 0 }
    );
  }, [liveItems]);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
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
            {(status === "ship" || status === "sold") && (
              <div className="mt-1 font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                {status === "ship" ? openOrderCount : shippedOrderCount} Orders
              </div>
            )}
          </button>
        ))}
      </div>

      <InventoryTabs
        items={items}
        orders={orders}
        ordersError={ordersError}
        onItemsChange={setLiveItems}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
    </>
  );
}
