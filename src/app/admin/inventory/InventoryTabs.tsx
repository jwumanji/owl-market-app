"use client";

import { Fragment, type MouseEvent, type SelectHTMLAttributes, useMemo, useState } from "react";

type InventoryType = "raw" | "damaged" | "graded" | "sealed";
type InventoryStatus = "new" | "grading" | "sale" | "sold";
type GradedRating = "TAG 10" | "PSA 10" | "PSA 9" | "BGS 10" | "BGS 9.5";
type StatusFilter = InventoryStatus | "all";
type SaleChannel = "not_sold" | "ebay" | "fb" | "instagram" | "in_person" | "traded";

export interface InventoryRow {
  id: string;
  inventory_type: InventoryType;
  status: InventoryStatus;
  quantity: number;
  graded_rating: GradedRating | null;
  shipping_tracking?: string | null;
  shipped_at?: string | null;
  sale_channel?: SaleChannel | null;
  sold_date?: string | null;
  sold_price?: string | number | null;
  acquired_at?: string | null;
  cost_basis?: string | number | null;
  notes?: string | null;
  pending_card_match?: boolean | null;
  card: {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    set_code: string | null;
  };
}

const TABS = [
  { id: "all", label: "All Items" },
  { id: "raw", label: "Raw" },
  { id: "damaged", label: "Damaged Card" },
  { id: "graded", label: "Graded Card" },
  { id: "sealed", label: "Sealed" },
] as const;

const STATUS_LABELS: Record<InventoryStatus, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  sold: "Sold",
};

const CONDITION_LABELS: Record<InventoryType, string> = {
  raw: "Raw",
  damaged: "Damaged",
  graded: "Graded",
  sealed: "Sealed",
};

const GRADED_RATINGS: GradedRating[] = ["TAG 10", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5"];
const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  not_sold: "Not Sold",
  ebay: "Ebay",
  fb: "FB",
  instagram: "Instagram",
  in_person: "In Person",
  traded: "Traded",
};

type InventoryGroup = {
  key: string;
  rows: InventoryRow[];
  first: InventoryRow;
  quantity: number;
  condition: InventoryType | null;
  status: InventoryStatus | null;
};

type CreatedInventoryItem = Pick<
  InventoryRow,
  "id" | "inventory_type" | "status" | "quantity" | "graded_rating" | "shipping_tracking" | "shipped_at"
  | "sale_channel" | "sold_date" | "sold_price"
>;

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

type HoverPreview = {
  src: string;
  name: string;
  x: number;
  y: number;
};

function SelectField({
  children,
  className = "",
  wrapperClassName = "",
  ...props
}: SelectFieldProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        {...props}
        className={`w-full appearance-none rounded-md border border-border bg-surface py-2.5 pl-3 pr-10 font-mono text-sm font-semibold text-text outline-none transition-colors hover:border-border-2 hover:bg-surf2 focus:border-owl focus:bg-surf2 ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-owl"
      >
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}

function groupKey(item: InventoryRow) {
  return [
    item.card.set_code ?? "NO_SET",
    item.card.card_number ?? "NO_NUMBER",
    item.card.name ?? "Unknown Card",
  ].join("|");
}

function insertAfterGroupRows(rows: InventoryRow[], targetKey: string, item: InventoryRow) {
  const lastGroupIndex = rows.reduce(
    (lastIndex, row, index) => (groupKey(row) === targetKey ? index : lastIndex),
    -1
  );

  if (lastGroupIndex === -1) {
    return [...rows, item];
  }

  return [
    ...rows.slice(0, lastGroupIndex + 1),
    item,
    ...rows.slice(lastGroupIndex + 1),
  ];
}

function sameValue<T>(values: T[]) {
  const [first] = values;
  return values.every((value) => value === first) ? first : null;
}

function detectCarrier(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const compact = normalized.replace(/[\s-]/g, "");

  if (normalized.includes("USPS.COM") || /^(94|93|92|95)\d{18,30}$/.test(compact)) {
    return "USPS";
  }

  if (normalized.includes("UPS.COM") || /^1Z[0-9A-Z]{16}$/.test(compact)) {
    return "UPS";
  }

  return null;
}

function isLocalOnlyItem(id: string) {
  return id.startsWith("preview-") || id.startsWith("temp-");
}

function cardImageUrl(item: InventoryRow) {
  return item.card.image_url_small ?? item.card.image_url;
}

export default function InventoryTabs({
  items,
  statusFilter = "all",
  onStatusFilterChange,
}: {
  items: InventoryRow[];
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (status: StatusFilter) => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [rows, setRows] = useState(items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [addingGroups, setAddingGroups] = useState<Record<string, boolean>>({});
  const [deletingItemIds, setDeletingItemIds] = useState<Record<string, boolean>>({});
  const [confirmingDeleteIds, setConfirmingDeleteIds] = useState<Record<string, boolean>>({});
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const showShipping = statusFilter === "sale";
  const showSaleFields = statusFilter === "sale" || statusFilter === "sold";

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      const matchesTab = activeTab === "all" || item.inventory_type === activeTab;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesTab && matchesStatus;
    });
  }, [activeTab, rows, statusFilter]);

  const statusFilteredRows = useMemo(() => {
    return rows.filter((item) => statusFilter === "all" || item.status === statusFilter);
  }, [rows, statusFilter]);

  const groups = useMemo<InventoryGroup[]>(() => {
    const map = new Map<string, InventoryRow[]>();
    for (const item of filtered) {
      const key = groupKey(item);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({
      key,
      rows: groupRows,
      first: groupRows[0],
      quantity: groupRows.reduce((sum, item) => sum + item.quantity, 0),
      condition: sameValue(groupRows.map((item) => item.inventory_type)),
      status: sameValue(groupRows.map((item) => item.status)),
    }));
  }, [filtered]);

  const counts = useMemo(() => {
    return statusFilteredRows.reduce(
      (acc, item) => {
        acc.all += item.quantity;
        acc[item.inventory_type] += item.quantity;
        return acc;
      },
      { all: 0, raw: 0, damaged: 0, graded: 0, sealed: 0 }
    );
  }, [statusFilteredRows]);

  const selectedGroup = useMemo<InventoryGroup | null>(() => {
    if (!selectedGroupKey) return null;
    const groupRows = rows.filter((item) => groupKey(item) === selectedGroupKey);
    if (groupRows.length === 0) return null;

    return {
      key: selectedGroupKey,
      rows: groupRows,
      first: groupRows[0],
      quantity: groupRows.reduce((sum, item) => sum + item.quantity, 0),
      condition: sameValue(groupRows.map((item) => item.inventory_type)),
      status: sameValue(groupRows.map((item) => item.status)),
    };
  }, [rows, selectedGroupKey]);

  async function updateItem(
    id: string,
    updates: Partial<Pick<InventoryRow, "status" | "graded_rating" | "inventory_type" | "shipping_tracking" | "shipped_at" | "sale_channel" | "sold_date" | "sold_price" | "acquired_at" | "cost_basis" | "notes">>
  ) {
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );

    if (isLocalOnlyItem(id)) {
      return;
    }

    const res = await fetch(`/api/admin/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      setRows(items);
    }
  }

  async function addIndividualItem(group: InventoryGroup) {
    if (addingGroups[group.key]) return;

    const source = group.first;
    const tempId = `temp-${source.id}-${Date.now()}`;
    const newItem: InventoryRow = {
      ...source,
      id: tempId,
      quantity: 1,
      shipping_tracking: null,
      shipped_at: null,
      sale_channel: source.sale_channel ?? "not_sold",
      sold_date: source.sold_date ?? null,
      sold_price: source.sold_price ?? null,
    };

    setActionError(null);
    setAddingGroups((current) => ({ ...current, [group.key]: true }));
    setOpenGroups((current) => ({ ...current, [group.key]: true }));
    setRows((current) => insertAfterGroupRows(current, group.key, newItem));

    if (source.id.startsWith("preview-")) {
      setAddingGroups((current) => ({ ...current, [group.key]: false }));
      return;
    }

    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: source.id }),
      });

      if (!res.ok) {
        throw new Error("Failed to add individual item");
      }

      const created = (await res.json()) as CreatedInventoryItem;
      setRows((current) =>
        current.map((item) =>
          item.id === tempId
            ? {
                ...newItem,
                id: created.id,
                inventory_type: created.inventory_type,
                status: created.status,
                quantity: created.quantity,
                graded_rating: created.graded_rating,
                shipping_tracking: created.shipping_tracking ?? null,
                shipped_at: created.shipped_at ?? null,
                sale_channel: created.sale_channel ?? "not_sold",
                sold_date: created.sold_date ?? null,
                sold_price: created.sold_price ?? null,
              }
            : item
        )
      );
    } catch {
      setRows((current) => current.filter((item) => item.id !== tempId));
      setActionError("Could not add the individual item. Try again.");
    } finally {
      setAddingGroups((current) => ({ ...current, [group.key]: false }));
    }
  }

  async function deleteItem(item: InventoryRow) {
    if (deletingItemIds[item.id]) return;

    setActionError(null);
    setDeletingItemIds((current) => ({ ...current, [item.id]: true }));
    setConfirmingDeleteIds((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setRows((current) => current.filter((row) => row.id !== item.id));

    if (isLocalOnlyItem(item.id)) {
      setDeletingItemIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove individual item");
      }
    } catch {
      setRows((current) => insertAfterGroupRows(current, groupKey(item), item));
      setActionError("Could not remove the inventory item. Try again.");
    } finally {
      setDeletingItemIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }

  function renderDeleteControls(item: InventoryRow) {
    const isConfirming = confirmingDeleteIds[item.id] ?? false;
    const isDeleting = deletingItemIds[item.id] ?? false;

    if (isConfirming) {
      return (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => deleteItem(item)}
            className="rounded-md border border-loss bg-loss/10 px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-loss transition-colors hover:bg-loss/15 disabled:cursor-wait disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() =>
              setConfirmingDeleteIds((current) => {
                const next = { ...current };
                delete next[item.id];
                return next;
              })
            }
            className="rounded-md border border-border-2 bg-surface px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-text-2 transition-colors hover:text-text disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        title="Remove item"
        aria-label="Remove item"
        disabled={isDeleting}
        onClick={() => setConfirmingDeleteIds((current) => ({ ...current, [item.id]: true }))}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-loss/70 bg-loss/10 font-mono text-base font-black leading-none text-loss transition-colors hover:border-loss hover:bg-loss/15 disabled:cursor-wait disabled:opacity-60"
      >
        X
      </button>
    );
  }

  function trackingHref(value: string) {
    if (/^https?:\/\//i.test(value)) return value;
    const carrier = detectCarrier(value);
    if (carrier === "UPS") {
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(value)}`;
    }
    if (carrier === "USPS") {
      return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(value)}`;
    }
    return null;
  }

  function todayDateString() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }

  function updateSaleChannel(item: InventoryRow, nextChannel: SaleChannel) {
    updateItem(item.id, {
      sale_channel: nextChannel,
      status: nextChannel === "not_sold" ? "sale" : "sold",
      sold_date: nextChannel === "not_sold" ? null : item.sold_date ?? todayDateString(),
    });
  }

  function renderSaleFields(item: InventoryRow) {
    const channel = item.sale_channel ?? "not_sold";
    const soldDate = channel === "not_sold" ? "" : item.sold_date ?? "";

    return (
      <>
        <td className="px-3 py-4">
          <SelectField
            value={channel}
            onChange={(event) => {
              const nextChannel = event.target.value as SaleChannel;
              updateSaleChannel(item, nextChannel);
            }}
          >
            {(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).map((option) => (
              <option key={option} value={option}>
                {SALE_CHANNEL_LABELS[option]}
              </option>
            ))}
          </SelectField>
        </td>
        <td className="px-3 py-4">
          <input
            type="date"
            value={soldDate}
            onChange={(event) => updateItem(item.id, { sold_date: event.target.value })}
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
          />
        </td>
        <td className="px-3 py-4">
          <input
            type="text"
            inputMode="decimal"
            value={item.sold_price ?? ""}
            onChange={(event) => updateItem(item.id, { sold_price: event.target.value })}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
          />
        </td>
      </>
    );
  }

  function renderShippingCell(item: InventoryRow) {
    if (item.shipping_tracking) {
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs font-semibold text-gain">
            Shipped
            {detectCarrier(item.shipping_tracking) && (
              <span className="ml-2 rounded border border-border bg-deep px-2 py-0.5 text-text">
                {detectCarrier(item.shipping_tracking)}
              </span>
            )}
          </div>
          {trackingHref(item.shipping_tracking) ? (
            <a
              href={trackingHref(item.shipping_tracking) ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-mono text-sm font-semibold text-owl underline-offset-2 hover:underline"
            >
              {item.shipping_tracking}
            </a>
          ) : (
            <div className="truncate font-mono text-sm text-text">
              {item.shipping_tracking}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="font-mono text-xs font-semibold text-text-2">Not shipped yet</div>
        <input
          value={trackingDrafts[item.id] ?? ""}
          onChange={(event) =>
            setTrackingDrafts((current) => ({
              ...current,
              [item.id]: event.target.value,
            }))
          }
          placeholder="Paste tracking code or link"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-owl"
        />
        <button
          type="button"
          disabled={!trackingDrafts[item.id]?.trim()}
          onClick={() =>
            updateItem(item.id, {
              shipping_tracking: trackingDrafts[item.id]?.trim() ?? "",
              shipped_at: new Date().toISOString(),
            })
          }
          className="rounded-md border border-owl bg-owl/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-owl disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-3"
        >
          Confirm Shipping
        </button>
      </div>
    );
  }

  function renderConditionControls(item: InventoryRow) {
    return (
      <>
        <SelectField
          value={item.inventory_type}
          onChange={(event) =>
            updateItem(item.id, { inventory_type: event.target.value as InventoryType })
          }
        >
          {(Object.keys(CONDITION_LABELS) as InventoryType[]).map((condition) => (
            <option key={condition} value={condition}>
              {CONDITION_LABELS[condition]}
            </option>
          ))}
        </SelectField>
        {item.inventory_type === "graded" && (
          <SelectField
            value={item.graded_rating ?? ""}
            onChange={(event) =>
              updateItem(item.id, {
                graded_rating: event.target.value ? (event.target.value as GradedRating) : null,
              })
            }
            wrapperClassName="mt-2"
          >
            <option value="">Select rating</option>
            {GRADED_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </SelectField>
        )}
      </>
    );
  }

  function renderStatusControl(item: InventoryRow) {
    return (
      <SelectField
        value={item.status}
        onChange={(event) =>
          updateItem(item.id, { status: event.target.value as InventoryStatus })
        }
      >
        {(Object.keys(STATUS_LABELS) as InventoryStatus[]).map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
    );
  }

  function renderCardImage(item: InventoryRow, size: "table" | "modal" | "small" = "table") {
    const imageUrl = cardImageUrl(item);
    const dimensions = size === "modal" ? "h-80 w-56" : size === "small" ? "h-20 w-14" : "h-28 w-20";

    if (!imageUrl) {
      return (
        <div className={`flex ${dimensions} items-center justify-center rounded-md border border-border bg-surf3 font-mono text-xs font-semibold text-text-2`}>
          BOX
        </div>
      );
    }

    return (
      <div className={`flex ${dimensions} items-center justify-center overflow-hidden rounded-md border border-border bg-surf3`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={item.card.name ?? "Card image"}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  function updateHoverPreview(event: MouseEvent, item: InventoryRow) {
    const imageUrl = cardImageUrl(item);
    if (!imageUrl) return;

    const previewWidth = 260;
    const previewHeight = 360;
    const margin = 18;
    const x = Math.min(event.clientX + margin, window.innerWidth - previewWidth - margin);
    const y = Math.min(event.clientY + margin, window.innerHeight - previewHeight - margin);

    setHoverPreview({
      src: imageUrl,
      name: item.card.name ?? "Card image",
      x: Math.max(margin, x),
      y: Math.max(margin, y),
    });
  }

  function renderHoverPreview() {
    if (!hoverPreview) return null;

    return (
      <div
        className="pointer-events-none fixed z-[60] rounded-lg border border-border bg-deep p-2 shadow-2xl"
        style={{ left: hoverPreview.x, top: hoverPreview.y }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hoverPreview.src}
          alt={hoverPreview.name}
          className="h-[340px] w-[238px] rounded-md object-cover"
        />
        <div className="mt-2 max-w-[238px] truncate font-mono text-xs font-semibold text-text">
          {hoverPreview.name}
        </div>
      </div>
    );
  }

  function renderInventoryDetailModal() {
    if (!selectedGroup) return null;

    const item = selectedGroup.first;

    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 pb-8 pt-[120px]">
        <div className="w-full max-w-6xl rounded-lg border border-border bg-deep shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div>
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">Inventory Detail</div>
              <h2 className="mt-1 text-2xl font-bold text-text">{item.card.name ?? "Unknown Card"}</h2>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs font-semibold text-text-2">
                {item.card.set_code && <span>{item.card.set_code}</span>}
                {item.card.card_number && <span>{item.card.card_number}</span>}
                {item.pending_card_match && <span className="text-owl">Needs Card Match</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGroupKey(null)}
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm font-bold uppercase tracking-wider text-text hover:border-border-2 hover:text-owl"
            >
              Close
            </button>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              {renderCardImage(item, "modal")}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="font-mono text-xs uppercase tracking-wider text-text-2">Quantity</div>
                  <div className="mt-1 text-2xl font-bold text-text">{selectedGroup.quantity}</div>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="font-mono text-xs uppercase tracking-wider text-text-2">Stage</div>
                  <div className="mt-1 text-lg font-bold text-text">
                    {selectedGroup.status ? STATUS_LABELS[selectedGroup.status] : "Mixed"}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {selectedGroup.rows.map((row, index) => (
                <div key={row.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-bold uppercase tracking-wider text-text">
                        Item #{index + 1}
                      </div>
                      <div className="mt-1 font-mono text-xs text-text-2">{row.id}</div>
                    </div>
                    {renderDeleteControls(row)}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Condition</span>
                      <div className="mt-2">{renderConditionControls(row)}</div>
                    </label>
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Stage</span>
                      <div className="mt-2">{renderStatusControl(row)}</div>
                    </label>
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Acquired Date</span>
                      <input
                        type="date"
                        value={row.acquired_at ?? ""}
                        onChange={(event) => updateItem(row.id, { acquired_at: event.target.value })}
                        className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
                      />
                    </label>
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Cost Basis</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.cost_basis ?? ""}
                        onChange={(event) => updateItem(row.id, { cost_basis: event.target.value })}
                        placeholder="0.00"
                        className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Sold At</span>
                      <SelectField
                        value={row.sale_channel ?? "not_sold"}
                        onChange={(event) => updateSaleChannel(row, event.target.value as SaleChannel)}
                        wrapperClassName="mt-2"
                      >
                        {(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).map((option) => (
                          <option key={option} value={option}>
                            {SALE_CHANNEL_LABELS[option]}
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Sold Date</span>
                      <input
                        type="date"
                        value={(row.sale_channel ?? "not_sold") === "not_sold" ? "" : row.sold_date ?? ""}
                        onChange={(event) => updateItem(row.id, { sold_date: event.target.value })}
                        className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
                      />
                    </label>
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Sold Price</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.sold_price ?? ""}
                        onChange={(event) => updateItem(row.id, { sold_price: event.target.value })}
                        placeholder="0.00"
                        className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
                      />
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Notes</span>
                    <textarea
                      value={row.notes ?? ""}
                      onChange={(event) => updateItem(row.id, { notes: event.target.value })}
                      rows={3}
                      placeholder="Condition notes, source, purchase details, or internal comments"
                      className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 text-sm text-text outline-none focus:border-owl"
                    />
                  </label>
                </div>
              ))}

              <button
                type="button"
                disabled={addingGroups[selectedGroup.key] ?? false}
                onClick={() => addIndividualItem(selectedGroup)}
                className="rounded-md border border-gain bg-[rgba(0,214,143,0.10)] px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-gain transition-colors hover:bg-[rgba(0,214,143,0.16)] disabled:cursor-wait disabled:opacity-60"
              >
                Add Individual Item
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStatusFilterChange?.("all")}
          className={`rounded-md border px-4 py-2.5 font-mono text-sm font-semibold transition-colors ${
            statusFilter === "all"
              ? "border-blue bg-blue/10 text-blue"
              : "border-border bg-surface text-text hover:border-border-2 hover:text-owl"
          }`}
        >
          All Statuses
        </button>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md border px-4 py-2.5 font-mono text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-owl bg-owl/10 text-owl"
                : "border-border bg-surface text-text hover:border-border-2 hover:text-owl"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-text-2">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <a
          href="/admin/inventory/new"
          className="rounded-md bg-owl px-5 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
        >
          Add Inventory
        </a>
      </div>

      {actionError && (
        <div className="rounded-md border border-loss/30 bg-loss/10 px-4 py-3 text-sm font-semibold text-text">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[1760px] table-fixed">
          <colgroup>
            <col className="w-[58px]" />
            <col className="w-[132px]" />
            <col className="w-[330px]" />
            <col className="w-[105px]" />
            {showShipping && <col className="w-[300px]" />}
            {showSaleFields && <col className="w-[185px]" />}
            {showSaleFields && <col className="w-[160px]" />}
            {showSaleFields && <col className="w-[145px]" />}
            <col className="w-[175px]" />
            <col className="w-[175px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surf2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-text">
              <th className="px-3 py-3.5" />
              <th className="px-4 py-3.5">Image</th>
              <th className="px-3 py-3.5">Card Name</th>
              <th className="px-3 py-3.5 text-right">Quantity</th>
              {showShipping && <th className="px-3 py-3.5">Shipping</th>}
              {showSaleFields && <th className="px-3 py-3.5">Sold At</th>}
              {showSaleFields && <th className="px-3 py-3.5">Sold Date</th>}
              {showSaleFields && <th className="px-3 py-3.5">Sold Price</th>}
              <th className="px-3 py-3.5">Condition</th>
              <th className="px-3 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const item = group.first;
              const hasNestedRows = group.rows.length > 1;
              const isOpen = hasNestedRows && (openGroups[group.key] ?? true);
              const isAdding = addingGroups[group.key] ?? false;

              return (
                <Fragment key={group.key}>
                  <tr className="border-b border-border hover:bg-surf2/70">
                    <td className="px-3 py-4">
                      {hasNestedRows && (
                        <button
                          type="button"
                          aria-label={isOpen ? "Collapse group" : "Expand group"}
                          onClick={() =>
                            setOpenGroups((current) => ({
                              ...current,
                              [group.key]: !isOpen,
                            }))
                          }
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                            isOpen
                              ? "border-owl bg-owl/15 text-owl"
                              : "border-border-2 bg-deep text-text hover:border-owl hover:text-owl"
                          }`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                            <path
                              d={isOpen ? "m7 15 5-5 5 5" : "m9 6 6 6-6 6"}
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedGroupKey(group.key)}
                        onMouseEnter={(event) => updateHoverPreview(event, item)}
                        onMouseMove={(event) => updateHoverPreview(event, item)}
                        onMouseLeave={() => setHoverPreview(null)}
                        className="block rounded-md outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-owl"
                      >
                        {renderCardImage(item)}
                      </button>
                    </td>
                    <td className="min-w-0 px-3 py-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedGroupKey(group.key)}
                            className="block max-w-full truncate text-left text-base font-bold text-text underline-offset-2 hover:text-owl hover:underline"
                          >
                            {item.card.name ?? "Unknown Card"}
                          </button>
                          <div className="mt-1.5 flex items-center gap-2 font-mono text-xs font-medium text-text-2">
                            {item.card.set_code && <span>{item.card.set_code}</span>}
                            {item.card.card_number && <span>{item.card.card_number}</span>}
                        <span className="rounded bg-surf3 px-2 py-0.5 text-text">GROUP</span>
                        {item.pending_card_match && (
                          <span className="rounded border border-owl/40 bg-owl/10 px-2 py-0.5 text-owl">
                            NEEDS MATCH
                          </span>
                        )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            title="Add individual item"
                            aria-label={`Add individual item for ${item.card.name ?? "this card"}`}
                            disabled={isAdding}
                            onClick={() => addIndividualItem(group)}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-gain bg-[rgba(0,214,143,0.10)] font-mono text-lg font-bold leading-none text-gain transition-colors hover:bg-[rgba(0,214,143,0.16)] disabled:cursor-wait disabled:opacity-60"
                          >
                            +
                          </button>
                          {!hasNestedRows && renderDeleteControls(item)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right font-mono text-base font-semibold text-text">{group.quantity}</td>
                    {showShipping && (
                      <td className="px-3 py-4 font-mono text-sm">
                        {group.rows.length === 1 ? (
                          renderShippingCell(group.rows[0])
                        ) : (
                          <span className={group.rows.some((row) => row.shipping_tracking) ? "font-semibold text-gain" : "text-text-2"}>
                            {group.rows.some((row) => row.shipping_tracking) ? "Shipped" : "Not shipped"}
                          </span>
                        )}
                      </td>
                    )}
                    {showSaleFields && group.rows.length === 1 && renderSaleFields(group.rows[0])}
                    {showSaleFields && group.rows.length > 1 && (
                      <>
                        <td className="px-3 py-4 font-mono text-sm font-semibold text-text-2">
                          {sameValue(group.rows.map((row) => row.sale_channel ?? "not_sold"))
                            ? SALE_CHANNEL_LABELS[sameValue(group.rows.map((row) => row.sale_channel ?? "not_sold")) as SaleChannel]
                            : "Mixed"}
                        </td>
                        <td className="px-3 py-4 font-mono text-sm font-semibold text-text-2">
                          {sameValue(group.rows.map((row) => row.sold_date ?? "")) || "Mixed"}
                        </td>
                        <td className="px-3 py-4 font-mono text-sm font-semibold text-text-2">
                          {sameValue(group.rows.map((row) => String(row.sold_price ?? ""))) || "Mixed"}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-4 font-mono text-sm font-medium text-text">
                      {hasNestedRows
                        ? group.condition
                          ? CONDITION_LABELS[group.condition]
                          : "Mixed"
                        : renderConditionControls(item)}
                    </td>
                    <td className="px-3 py-4 font-mono text-sm font-medium text-text">
                      {hasNestedRows
                        ? group.status
                          ? STATUS_LABELS[group.status]
                          : "Mixed"
                        : renderStatusControl(item)}
                    </td>
                  </tr>

                  {isOpen && (
                    <>
                      {group.rows.map((child, index) => (
                        <tr
                          key={child.id}
                          className="border-b border-[rgba(79,142,247,0.16)] bg-[rgba(79,142,247,0.075)] shadow-[inset_3px_0_0_rgba(79,142,247,0.45)] transition-colors hover:bg-[rgba(79,142,247,0.11)]"
                        >
                          <td className="px-3 py-3.5" />
                          <td className="px-3 py-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedGroupKey(group.key)}
                              onMouseEnter={(event) => updateHoverPreview(event, child)}
                              onMouseMove={(event) => updateHoverPreview(event, child)}
                              onMouseLeave={() => setHoverPreview(null)}
                              className="flex w-16 flex-col items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-owl"
                            >
                              {renderCardImage(child, "small")}
                              <span className="rounded-full border border-owl bg-owl px-2.5 py-1 font-mono text-xs font-black leading-none text-void shadow-[0_0_14px_rgba(245,166,35,0.45)]">
                                #{index + 1}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setSelectedGroupKey(group.key)}
                                  className="block max-w-full truncate text-left text-base font-semibold text-text underline-offset-2 hover:text-owl hover:underline"
                                >
                                  {child.card.name ?? "Unknown Card"}
                                </button>
                                <div className="mt-1 truncate font-mono text-xs text-text-2">{child.id}</div>
                              </div>
                              {renderDeleteControls(child)}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-right font-mono text-base font-semibold text-text">{child.quantity}</td>
                          {showShipping && (
                            <td className="px-3 py-3.5">
                              {renderShippingCell(child)}
                            </td>
                          )}
                          {showSaleFields && renderSaleFields(child)}
                          <td className="px-3 py-3.5">
                            {renderConditionControls(child)}
                          </td>
                          <td className="px-3 py-3.5">
                            {renderStatusControl(child)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-b border-[rgba(79,142,247,0.16)] bg-[rgba(79,142,247,0.045)] shadow-[inset_3px_0_0_rgba(79,142,247,0.32)] last:border-b-0">
                        <td className="px-3 py-3.5" />
                        <td colSpan={(showShipping ? 6 : 5) + (showSaleFields ? 3 : 0)} className="px-3 py-3.5">
                          <button
                            type="button"
                            disabled={isAdding}
                            onClick={() => addIndividualItem(group)}
                            className="inline-flex items-center gap-2 rounded-md border border-gain bg-[rgba(0,214,143,0.10)] px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-gain transition-colors hover:bg-[rgba(0,214,143,0.16)] disabled:cursor-wait disabled:opacity-60"
                          >
                            <span className="text-base leading-none">+</span>
                            Add individual item
                          </button>
                        </td>
                      </tr>
                    </>
                  )}
                </Fragment>
              );
            })}

            {groups.length === 0 && (
              <tr>
                <td colSpan={(showShipping ? 7 : 6) + (showSaleFields ? 3 : 0)} className="px-3 py-12 text-center text-base text-text-2">
                  No inventory items in this view yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {renderHoverPreview()}
      {renderInventoryDetailModal()}
    </div>
  );
}
