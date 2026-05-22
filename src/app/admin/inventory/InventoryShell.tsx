"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InventoryTabs, { InventoryRow } from "./InventoryTabs";
import type { InventoryBundleSummary } from "../bundles/bundle-types";
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
  bundles = [],
  bundlesError = null,
  initialStatusFilter = "all",
  initialPsa10CandidatesOnly = false,
}: {
  items: InventoryRow[];
  orders?: CustomerOrderSummary[];
  ordersError?: string | null;
  bundles?: InventoryBundleSummary[];
  bundlesError?: string | null;
  initialStatusFilter?: StatusFilter;
  initialPsa10CandidatesOnly?: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [psa10CandidatesOnly, setPsa10CandidatesOnly] = useState(initialPsa10CandidatesOnly);
  const [liveItems, setLiveItems] = useState(items);
  const [liveOrders, setLiveOrders] = useState(orders);
  const [liveBundles, setLiveBundles] = useState(bundles);
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
    setPsa10CandidatesOnly(initialPsa10CandidatesOnly);
  }, [initialPsa10CandidatesOnly]);

  useEffect(() => {
    setLiveItems(items);
  }, [items]);

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  useEffect(() => {
    setLiveBundles(bundles);
  }, [bundles]);

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
  const psa10CandidateCount = useMemo(() => {
    return liveItems.filter((item) => item.centering_ceiling === "PSA_10").length;
  }, [liveItems]);

  function setPsa10CandidateFilter(next: boolean) {
    setPsa10CandidatesOnly(next);

    const params = new URLSearchParams(window.location.search);
    if (next) {
      params.set("centering", "psa10");
    } else {
      params.delete("centering");
    }

    if (statusFilter === "all") {
      params.delete("status");
    } else {
      params.set("status", statusFilter);
    }

    const query = params.toString();
    router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.keys(STATUS_LABELS) as InventoryStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            className={`admin-scard${statusFilter === status ? " active" : ""}`}
          >
            <div className="slbl">{STATUS_LABELS[status]}</div>
            {status === "ship" ? (
              <>
                <div className="mt-auto font-grotesk text-2xl font-bold text-coral">
                  {needShippingOrderCount} Orders
                </div>
                <div className="mt-1 font-grotesk text-base font-bold text-ink-2">
                  {byStatus.ship} Cards
                </div>
              </>
            ) : (
              <>
                <div className="snum">{byStatus[status]}</div>
                {status === "sold" && <div className="ssub">{shippedOrderCount} Orders</div>}
              </>
            )}
          </button>
        ))}
      </div>

      {psa10CandidatesOnly && (
        <div className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-md border border-gain-2/50 bg-[#DCF1E6] px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-gain-2">
          <span>
            {psa10CandidateCount} PSA 10 centering candidate{psa10CandidateCount === 1 ? "" : "s"} shown
          </span>
          <button
            type="button"
            aria-pressed={psa10CandidatesOnly}
            onClick={() => setPsa10CandidateFilter(false)}
            className="rounded border border-gain-2/50 px-2 py-1 text-[11px] transition-colors hover:bg-[#C8EBD6]"
          >
            Clear
          </button>
        </div>
      )}

      <InventoryTabs
        items={items}
        orders={liveOrders}
        ordersError={ordersError}
        bundles={liveBundles}
        bundlesError={bundlesError}
        onItemsChange={setLiveItems}
        onOrdersChange={setLiveOrders}
        onBundlesChange={setLiveBundles}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        psa10CandidatesOnly={psa10CandidatesOnly}
      />
    </>
  );
}
