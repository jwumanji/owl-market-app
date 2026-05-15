"use client";

import { type FormEvent, type MouseEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { INVENTORY_STATUSES, type InventoryStatus } from "@/lib/inventory-options";
import { SALE_CHANNEL_LABELS, SALE_CHANNELS, type SaleChannel } from "@/lib/sale-options";
import type { BundleInventoryItem, InventoryBundleFormValue } from "./bundle-types";

const STATUS_LABELS: Record<InventoryStatus, string> = {
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
  inventoryItems: BundleInventoryItem[];
  initialBundle?: InventoryBundleFormValue | null;
};

type HoverPreview = {
  src: string;
  title: string;
  x: number;
  y: number;
  placement: "left" | "right";
};

function cardTitle(item: BundleInventoryItem) {
  return item.item_nickname || item.card.name || "Untitled inventory item";
}

function cardMeta(item: BundleInventoryItem) {
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

function cardSearchText(item: BundleInventoryItem) {
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

function cardImageUrl(item: BundleInventoryItem) {
  return item.custom_image_front_url ?? item.card.image_url_small ?? item.card.image_url;
}

function selectedGroupKey(item: BundleInventoryItem) {
  return [TYPE_LABELS[item.inventory_type] ?? item.inventory_type, item.card.set_code ?? "No Set"].join(" / ");
}

function groupSelectedItems(items: BundleInventoryItem[]) {
  const groups = new Map<string, BundleInventoryItem[]>();
  items.forEach((item) => {
    const key = selectedGroupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return Array.from(groups.entries());
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default function BundleForm({ inventoryItems, initialBundle }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialBundle?.name ?? "");
  const [notes, setNotes] = useState(initialBundle?.notes ?? "");
  const [status, setStatus] = useState<InventoryStatus>(initialBundle?.status ?? "new");
  const [saleChannel, setSaleChannel] = useState<SaleChannel>(initialBundle?.sale_channel ?? "not_sold");
  const [soldDate, setSoldDate] = useState(initialBundle?.sold_date ?? "");
  const [soldPrice, setSoldPrice] = useState(initialBundle?.sold_price?.toString() ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialBundle?.inventory_item_ids ?? []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);

  const itemMap = useMemo(() => new Map(inventoryItems.map((item) => [item.id, item])), [inventoryItems]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as BundleInventoryItem[],
    [itemMap, selectedIds]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return inventoryItems
      .filter((item) => !normalizedQuery || cardSearchText(item).includes(normalizedQuery))
      .slice(0, 100);
  }, [inventoryItems, query]);

  function addItem(itemId: string) {
    if (selectedIdSet.has(itemId)) return;
    setSelectedIds((current) => [...current, itemId]);
  }

  function removeItem(itemId: string) {
    setSelectedIds((current) => current.filter((id) => id !== itemId));
  }

  function updateStatus(nextStatus: InventoryStatus) {
    setStatus(nextStatus);
    if (nextStatus === "sold") {
      setSoldDate((current) => current || todayDateString());
      return;
    }

    setSaleChannel("not_sold");
    setSoldDate("");
    setSoldPrice("");
  }

  function updateSaleChannel(nextChannel: SaleChannel) {
    setSaleChannel(nextChannel);
    if (nextChannel === "not_sold") {
      setSoldDate("");
      return;
    }

    setSoldDate((current) => current || todayDateString());
  }

  function updateHoverPreview(item: BundleInventoryItem, event: MouseEvent<HTMLElement>) {
    const imageUrl = cardImageUrl(item);
    if (!imageUrl) return;

    setHoverPreview({
      src: imageUrl,
      title: cardTitle(item),
      x: event.clientX,
      y: event.clientY,
      placement: event.clientX > window.innerWidth - 320 ? "left" : "right",
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Bundle name is required.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Choose at least one inventory item for this bundle.");
      return;
    }

    setSaving(true);
    const res = await fetch(initialBundle ? `/api/admin/bundles/${initialBundle.id}` : "/api/admin/bundles", {
      method: initialBundle ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        notes,
        status,
        sale_channel: saleChannel,
        sold_date: soldDate,
        sold_price: soldPrice,
        inventory_item_ids: selectedIds,
      }),
    });

    const payload = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(payload?.error ?? "Could not save bundle.");
      return;
    }

    router.push(`/admin/bundles/${payload.id}`);
    router.refresh();
  }

  async function deleteBundle() {
    if (!initialBundle || !window.confirm(`Delete bundle "${initialBundle.name}"?`)) return;

    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/admin/bundles/${initialBundle.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => null);
    setDeleting(false);

    if (!res.ok) {
      setError(payload?.error ?? "Could not delete bundle.");
      return;
    }

    router.push("/admin/bundles");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {hoverPreview && (
        <div
          className="pointer-events-none fixed z-50 hidden w-56 rounded-lg border border-border-2 bg-surface p-2 shadow-2xl shadow-black/50 lg:block"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
            transform:
              hoverPreview.placement === "left"
                ? "translate(-100%, -35%) translateX(-18px)"
                : "translate(18px, -35%)",
          }}
        >
          <div className="overflow-hidden rounded-md border border-border bg-deep">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hoverPreview.src} alt={hoverPreview.title} className="max-h-80 w-full object-contain" />
          </div>
          <div className="mt-2 line-clamp-2 text-xs font-bold leading-snug text-text">{hoverPreview.title}</div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-loss/40 bg-loss/10 p-3 text-sm font-semibold text-text">
          {error}
        </div>
      )}

      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Bundle Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={160}
              placeholder="PSA sequential bundle, deck core, promo lot..."
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>
          <label>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Bundle Status</span>
            <select
              value={status}
              onChange={(event) => updateStatus(event.target.value as InventoryStatus)}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
            >
              {INVENTORY_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Optional internal notes"
            className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
          />
        </label>

        <div className="rounded-md border border-border bg-deep p-3">
          <div className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-owl">
            Bundle Sale Details
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <label>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Sold At</span>
              <select
                value={saleChannel}
                onChange={(event) => updateSaleChannel(event.target.value as SaleChannel)}
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
              >
                {SALE_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {SALE_CHANNEL_LABELS[channel]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Sold Date</span>
              <input
                type="date"
                value={soldDate}
                onChange={(event) => setSoldDate(event.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
              />
            </label>
            <label>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">Sold Price</span>
              <input
                type="text"
                inputMode="decimal"
                value={soldPrice}
                onChange={(event) => setSoldPrice(event.target.value)}
                placeholder="0.00"
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-text">Inventory Search</h2>
                <p className="mt-1 text-sm text-text-2">Search available inventory and add cards to this bundle.</p>
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
                        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
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
              <h2 className="text-xl font-bold text-text">Bundle Items</h2>
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
                        <div
                          className="flex h-24 w-16 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded border border-border bg-surf3"
                          onMouseEnter={(event) => updateHoverPreview(item, event)}
                          onMouseMove={(event) => updateHoverPreview(item, event)}
                          onMouseLeave={() => setHoverPreview(null)}
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
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

      <div className="flex flex-wrap justify-end gap-3">
        {initialBundle && (
          <button
            type="button"
            onClick={deleteBundle}
            disabled={deleting || saving}
            className="rounded-md border border-loss px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-loss transition-colors hover:bg-loss/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Bundle"}
          </button>
        )}
        <button
          type="submit"
          disabled={saving || deleting}
          className="rounded-md bg-owl px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:bg-surf3 disabled:text-text-3"
        >
          {saving ? "Saving..." : initialBundle ? "Save Bundle" : "Create Bundle"}
        </button>
      </div>
    </form>
  );
}
