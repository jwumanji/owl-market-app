"use client";

import { useEffect, useMemo, useState } from "react";
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
  initialStatusFilter = "all",
}: {
  items: InventoryRow[];
  orders?: CustomerOrderSummary[];
  ordersError?: string | null;
  initialStatusFilter?: StatusFilter;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [liveItems, setLiveItems] = useState(items);
  const [liveOrders, setLiveOrders] = useState(orders);
  const openOrders = liveOrders.filter((order) => !order.marked_shipped);
  const openOrderCount = openOrders.length;
  const shippedOrderCount = liveOrders.length - openOrderCount;
  const openOrderItemIds = useMemo(
    () => new Set(openOrders.flatMap((order) => order.inventory_item_ids)),
    [openOrders]
  );

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  const byStatus = useMemo(() => {
    return liveItems.reduce(
      (acc, item) => {
        acc[item.status] += item.quantity;
        return acc;
      },
      { new: 0, grading: 0, sale: 0, ship: 0, sold: 0 }
    );
  }, [liveItems]);
  const standaloneShippingOrderCount = useMemo(() => {
    return liveItems.filter((item) => item.status === "ship" && !openOrderItemIds.has(item.id)).length;
  }, [liveItems, openOrderItemIds]);
  const needShippingOrderCount = openOrderCount + standaloneShippingOrderCount;

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
            {status === "ship" ? (
              <div className="mt-3 grid gap-1 font-mono font-bold uppercase tracking-wider">
                <div className="text-2xl text-owl">{needShippingOrderCount} Orders</div>
                <div className="text-lg text-blue">{byStatus.ship} Cards</div>
              </div>
            ) : (
              <>
                <div className="mt-2 text-3xl font-bold text-text">{byStatus[status]}</div>
                {status === "sold" && (
                  <div className="mt-1 font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                    {shippedOrderCount} Orders
                  </div>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      <InventoryTabs
        items={items}
        orders={liveOrders}
        ordersError={ordersError}
        onItemsChange={setLiveItems}
        onOrdersChange={setLiveOrders}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
    </>
  );
}
