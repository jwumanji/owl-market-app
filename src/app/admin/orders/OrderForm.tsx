"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerOrderFormValue, OrderInventoryItem } from "./order-types";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

const TYPE_LABELS: Record<string, string> = {
  raw: "Raw",
  damaged: "Damaged",
  graded: "Graded",
  sealed: "Sealed",
};

type Props = {
  inventoryItems: OrderInventoryItem[];
  initialOrder?: CustomerOrderFormValue | null;
};

function cardTitle(item: OrderInventoryItem) {
  return item.item_nickname || item.card.name || "Untitled inventory item";
}

function cardMeta(item: OrderInventoryItem) {
  return [
    item.card.set_code,
    item.card.card_number,
    TYPE_LABELS[item.inventory_type],
    item.graded_rating,
    item.certification_number ? `Cert ${item.certification_number}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function cardSearchText(item: OrderInventoryItem) {
  return [
    item.id,
    item.item_nickname,
    item.card.name,
    item.card.set_code,
    item.card.card_number,
    item.inventory_type,
    item.status,
    item.graded_rating,
    item.certification_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function cardImageUrl(item: OrderInventoryItem) {
  return item.custom_image_front_url ?? item.card.image_url_small ?? item.card.image_url;
}

function selectedGroupKey(item: OrderInventoryItem) {
  return [TYPE_LABELS[item.inventory_type] ?? item.inventory_type, item.card.set_code ?? "No Set"].join(" / ");
}

function groupSelectedItems(items: OrderInventoryItem[]) {
  const groups = new Map<string, OrderInventoryItem[]>();
  items.forEach((item) => {
    const key = selectedGroupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return Array.from(groups.entries());
}

export default function OrderForm({ inventoryItems, initialOrder }: Props) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialOrder?.nickname ?? "");
  const [customerName, setCustomerName] = useState(initialOrder?.customer_name ?? "");
  const [shippingLabel, setShippingLabel] = useState(initialOrder?.shipping_label ?? "");
  const [markedShipped, setMarkedShipped] = useState(initialOrder?.marked_shipped ?? false);
  const [trackingNumber, setTrackingNumber] = useState(initialOrder?.tracking_number ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialOrder?.inventory_item_ids ?? []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemMap = useMemo(() => new Map(inventoryItems.map((item) => [item.id, item])), [inventoryItems]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as OrderInventoryItem[],
    [itemMap, selectedIds]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return inventoryItems
      .filter((item) => !normalizedQuery || cardSearchText(item).includes(normalizedQuery))
      .slice(0, 80);
  }, [inventoryItems, query]);

  function addItem(itemId: string) {
    if (selectedIdSet.has(itemId)) return;
    setSelectedIds((current) => [...current, itemId]);
  }

  function removeItem(itemId: string) {
    setSelectedIds((current) => current.filter((id) => id !== itemId));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selectedIds.length === 0) {
      setError("Choose at least one inventory item for this order.");
      return;
    }

    setSaving(true);
    const res = await fetch(initialOrder ? `/api/admin/orders/${initialOrder.id}` : "/api/admin/orders", {
      method: initialOrder ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname,
        customer_name: customerName,
        shipping_label: shippingLabel,
        marked_shipped: markedShipped,
        tracking_number: trackingNumber,
        inventory_item_ids: selectedIds,
      }),
    });

    const payload = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(payload?.error ?? "Could not save order.");
      return;
    }

    router.push(`/admin/orders/${payload.id}`);
    router.refresh();
  }

  async function deleteOrder() {
    if (!initialOrder || !window.confirm(`Delete order ${initialOrder.id}?`)) return;

    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${initialOrder.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => null);
    setDeleting(false);

    if (!res.ok) {
      setError(payload?.error ?? "Could not delete order.");
      return;
    }

    router.push("/admin/orders");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Customer Order #</span>
            <input
              value={initialOrder?.id ?? "Generated when saved"}
              readOnly
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 font-mono text-sm text-text-2 outline-none"
            />
          </label>
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Nickname Order</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={120}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Customer Name</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              required
              maxLength={160}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Tracking #</span>
            <input
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              maxLength={180}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>
        </div>

        <label>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Shipping Label</span>
          <textarea
            value={shippingLabel}
            onChange={(event) => setShippingLabel(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
          />
        </label>

        <label className="flex items-center gap-3 rounded-md border border-border bg-deep px-3 py-3">
          <input
            type="checkbox"
            checked={markedShipped}
            onChange={(event) => setMarkedShipped(event.target.checked)}
            className="h-4 w-4 accent-owl"
          />
          <span className="font-mono text-sm font-bold uppercase tracking-wider text-text">Marked Shipped</span>
        </label>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Inventory Search</h2>
                <p className="mt-1 text-sm text-text-2">Search existing product inventory and add cards to the order.</p>
              </div>
              <div className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                {inventoryItems.length} Available
              </div>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search card, set, nickname, cert, or inventory id"
              className="mt-4 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </div>

          <div className="max-h-[620px] overflow-y-auto p-3">
            <div className="grid gap-2">
              {filteredItems.map((item) => {
                const imageUrl = cardImageUrl(item);
                const selected = selectedIdSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    disabled={selected}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "cursor-not-allowed border-owl/30 bg-owl/10 opacity-70"
                        : "border-border bg-deep hover:border-border-2 hover:bg-surf2"
                    }`}
                  >
                    <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surf3">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-mono text-[10px] text-text-3">NO IMG</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-text">{cardTitle(item)}</div>
                      <div className="mt-1 truncate font-mono text-xs text-text-2">{cardMeta(item)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded border border-border bg-surface px-2 py-1 font-mono text-[10px] font-bold uppercase text-text-2">
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="rounded border border-border bg-surface px-2 py-1 font-mono text-[10px] font-bold uppercase text-text-2">
                          {item.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <span className={`font-mono text-xs font-bold uppercase ${selected ? "text-owl" : "text-gain"}`}>
                      {selected ? "Added" : "Add"}
                    </span>
                  </button>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-2">
                  No inventory items match that search.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-text">Order Bundle</h2>
              <span className="rounded-md border border-owl/30 bg-owl/10 px-3 py-1 font-mono text-xs font-bold uppercase text-owl">
                {selectedItems.length} Cards
              </span>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 p-3">
            {groupSelectedItems(selectedItems).map(([group, items]) => (
              <div key={group} className="min-w-0 overflow-hidden rounded-lg border border-border bg-deep">
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
                  <div className="min-w-0 truncate font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                    {group}
                  </div>
                  <div className="shrink-0 font-mono text-xs font-bold text-text">{items.length}</div>
                </div>
                <div className="grid min-w-0 gap-2 p-2">
                  {items.map((item) => {
                    const imageUrl = cardImageUrl(item);
                    return (
                      <div
                        key={item.id}
                        className="flex min-w-0 items-center gap-3 overflow-hidden rounded-md border border-border bg-surface p-2"
                      >
                        <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surf3">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-mono text-[10px] text-text-3">NO IMG</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-bold text-text">{cardTitle(item)}</div>
                          <div className="mt-1 truncate font-mono text-sm font-semibold text-owl">
                            {cardMeta(item)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="shrink-0 rounded border border-loss/30 px-2 py-1 font-mono text-[10px] font-bold uppercase text-loss transition-colors hover:bg-loss/10"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {selectedItems.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-2">
                No cards selected yet.
              </div>
            )}
          </div>
        </section>
      </div>

      {error && <div className="rounded-md border border-loss/30 bg-loss/10 p-3 text-sm text-text">{error}</div>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {initialOrder && (
            <button
              type="button"
              onClick={deleteOrder}
              disabled={deleting || saving}
              className="rounded-md border border-loss/30 px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-loss transition-colors hover:bg-loss/10 disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Order"}
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || deleting}
          className="rounded-md bg-owl px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-wait disabled:bg-surf3 disabled:text-text-3"
        >
          {saving ? "Saving..." : initialOrder ? "Save Order" : "Create Order"}
        </button>
      </div>
    </form>
  );
}
