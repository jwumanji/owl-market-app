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
  initialSelectedIds?: string[];
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

export default function BundleForm({ inventoryItems, initialBundle, initialSelectedIds = [] }: Props) {
  const router = useRouter();
  const availableItemIds = useMemo(() => new Set(inventoryItems.map((item) => item.id)), [inventoryItems]);
  const startingSelectedIds = useMemo(() => {
    const sourceIds = initialBundle?.inventory_item_ids ?? initialSelectedIds;
    return Array.from(new Set(sourceIds.filter((id) => availableItemIds.has(id))));
  }, [availableItemIds, initialBundle?.inventory_item_ids, initialSelectedIds]);
  const [name, setName] = useState(initialBundle?.name ?? "");
  const [notes, setNotes] = useState(initialBundle?.notes ?? "");
  const [status, setStatus] = useState<InventoryStatus>(initialBundle?.status ?? "new");
  const [saleChannel, setSaleChannel] = useState<SaleChannel>(initialBundle?.sale_channel ?? "not_sold");
  const [soldDate, setSoldDate] = useState(initialBundle?.sold_date ?? "");
  const [soldPrice, setSoldPrice] = useState(initialBundle?.sold_price?.toString() ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(startingSelectedIds);
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

    if (initialBundle) {
      router.push(`/admin/bundles/${payload.id}`);
    } else {
      router.push(`/admin/bundles?created=${encodeURIComponent(name.trim())}`);
    }
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
          className="pointer-events-none fixed z-50 hidden w-56 rounded-c-md border-[1.5px] border-ink bg-bg-2 p-2 shadow-[0_12px_32px_rgba(26,15,8,0.18)] lg:block"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
            transform:
              hoverPreview.placement === "left"
                ? "translate(-100%, -35%) translateX(-18px)"
                : "translate(18px, -35%)",
          }}
        >
          <div className="overflow-hidden rounded border-[1.5px] border-ink bg-bg-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hoverPreview.src} alt={hoverPreview.title} className="max-h-80 w-full object-contain" />
          </div>
          <div className="mt-2 line-clamp-2 font-grotesk text-xs font-bold leading-snug text-ink">
            {hoverPreview.title}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm font-semibold text-ink">
          {error}
        </div>
      )}

      <div className="admin-card p-6">
        <div className="mb-4 font-grotesk text-xl font-bold tracking-tight text-ink">Bundle details</div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="admin-field-label block">
              Bundle Name <span className="admin-required">*</span>
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={160}
              placeholder="PSA sequential bundle, deck core, promo lot..."
              className="admin-input mt-2 w-full"
            />
          </label>
          <label className="block">
            <span className="admin-field-label block">
              Bundle Status <span className="admin-required">*</span>
            </span>
            <select
              value={status}
              onChange={(event) => updateStatus(event.target.value as InventoryStatus)}
              className="admin-input mt-2 w-full cursor-pointer"
            >
              {INVENTORY_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="admin-field-label block">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Optional internal notes"
            className="admin-input mt-2 min-h-[72px] w-full resize-y py-3 leading-snug"
          />
        </label>

        {status === "sold" && (
          <div className="mt-4 rounded-c-md border-[1.5px] border-dashed border-gain-2 bg-[#F3FAF6] p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <span className="font-grotesk text-sm font-bold text-ink">Sale info</span>
              <span className="inline-flex items-center rounded border-[1.2px] border-gain-2 bg-[#DCF1E6] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-gain-2">
                shows when status = sold
              </span>
            </div>
            <div className="grid gap-3.5 lg:grid-cols-3">
              <label className="block">
                <span className="admin-field-label block">Sold At</span>
                <select
                  value={saleChannel}
                  onChange={(event) => updateSaleChannel(event.target.value as SaleChannel)}
                  className="admin-input mt-2 w-full cursor-pointer"
                >
                  {SALE_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {SALE_CHANNEL_LABELS[channel]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="admin-field-label block">Sold Date</span>
                <input
                  type="date"
                  value={soldDate}
                  onChange={(event) => setSoldDate(event.target.value)}
                  className="admin-input mt-2 w-full"
                />
              </label>
              <label className="block">
                <span className="admin-field-label block">Sold Price</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={soldPrice}
                  onChange={(event) => setSoldPrice(event.target.value)}
                  placeholder="0.00"
                  className="admin-input mt-2 w-full"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <section className="admin-card min-w-0 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-grotesk text-lg font-bold tracking-tight text-ink">Inventory Search</h2>
              <p className="mt-1 font-grotesk text-sm text-ink-2">
                Search available inventory and add cards to this bundle.
              </p>
            </div>
            <div className="inline-flex shrink-0 items-center rounded-c-sm border-[1.5px] border-ink bg-bg-3 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
              {inventoryItems.length} Available
            </div>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search card, set, nickname, cert, or inventory id"
            className="admin-input mt-3 w-full"
          />

          <div className="mt-3 max-h-[480px] overflow-hidden overflow-y-auto rounded-c-sm border-[1.5px] border-ink">
            <div className="flex flex-col">
              {filteredItems.map((item, index) => {
                const imageUrl = cardImageUrl(item);
                const selected = selectedIdSet.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 border-l-[3px] px-3 py-2.5 ${
                      index === 0 ? "" : "border-t border-t-bg-3"
                    } ${selected ? "border-l-select bg-[#F2F5FB]" : "border-l-transparent bg-bg-2"}`}
                  >
                    <div className="flex h-[53px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded border-[1.5px] border-ink bg-bg-2">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="font-mono text-[9px] uppercase text-ink-3">No img</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-grotesk text-[13px] font-bold text-ink">{cardTitle(item)}</div>
                      <div className="mt-0.5 truncate font-mono text-[10.5px] font-medium text-ink-2">
                        {cardMeta(item)}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded border-[1.2px] border-ink-3 bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2">
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="rounded border-[1.2px] border-ink-3 bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2">
                          {item.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(item.id)}
                      disabled={selected}
                      className={`shrink-0 rounded-c-sm border-[1.5px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                        selected
                          ? "cursor-not-allowed border-select bg-select text-bg"
                          : "border-ink bg-bg-2 text-ink hover:bg-bg-3"
                      }`}
                    >
                      {selected ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="border-[1.5px] border-dashed border-ink-3 p-8 text-center font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                  No inventory items match that search.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="admin-card min-w-0 overflow-hidden p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-grotesk text-lg font-bold tracking-tight text-ink">Bundle Items</h2>
            <span className="inline-flex shrink-0 items-center rounded-c-sm border-[1.5px] border-ink bg-bg-3 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
              {selectedItems.length} Cards
            </span>
          </div>

          <div className="grid min-w-0 gap-3.5">
            {groupSelectedItems(selectedItems).map(([group, items]) => (
              <div key={group} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                  <div className="min-w-0 truncate">{group}</div>
                  <div className="shrink-0 text-ink-3">{items.length}</div>
                </div>
                <div className="grid min-w-0 gap-2">
                  {items.map((item) => {
                    const imageUrl = cardImageUrl(item);
                    return (
                      <div
                        key={item.id}
                        className="flex min-w-0 items-center gap-3 rounded-c-sm border-[1.5px] border-ink bg-bg px-3 py-2.5"
                      >
                        <div
                          className="flex h-[66px] w-12 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded border-[1.5px] border-ink bg-bg-2"
                          onMouseEnter={(event) => updateHoverPreview(item, event)}
                          onMouseMove={(event) => updateHoverPreview(item, event)}
                          onMouseLeave={() => setHoverPreview(null)}
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <span className="font-mono text-[10px] uppercase text-ink-3">No img</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-grotesk text-[13px] font-bold text-ink">
                            {cardTitle(item)}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[10.5px] font-medium text-ink-2">
                            {cardMeta(item)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="shrink-0 rounded-c-sm border-[1.5px] border-coral bg-bg-2 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-coral transition-colors hover:bg-[#FFE2DD]"
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
              <div className="rounded-c-sm border-[1.5px] border-dashed border-ink-3 p-7 text-center font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                No cards selected yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <div>
          {initialBundle && (
            <button
              type="button"
              onClick={deleteBundle}
              disabled={deleting || saving}
              className="admin-btn admin-btn-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Bundle"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving || deleting}
            className="admin-btn admin-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : initialBundle ? "Save Bundle" : "Create Bundle"}
          </button>
        </div>
      </div>
    </form>
  );
}
