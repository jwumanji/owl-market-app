"use client";

import { Fragment, type MouseEvent, type SelectHTMLAttributes, useCallback, useEffect, useMemo, useState } from "react";
import { GRADED_RATINGS, type CatalogMatchStatus, type GradedRating, type InventoryStatus, type InventoryType } from "@/lib/inventory-options";
import type { CustomerOrderSummary } from "../orders/order-types";

type StatusFilter = InventoryStatus | "all";
type SaleChannel = "not_sold" | "ebay" | "fb" | "instagram" | "in_person" | "traded";
type PurchasedFrom = "facebook" | "ebay" | "instagram" | "direct_person" | "event";

export interface InventoryRow {
  id: string;
  created_at: string | null;
  inventory_type: InventoryType;
  status: InventoryStatus;
  quantity: number;
  item_nickname?: string | null;
  graded_rating: GradedRating | null;
  certification_number?: string | null;
  custom_image_front_url?: string | null;
  custom_image_back_url?: string | null;
  customer_name?: string | null;
  shipping_tracking?: string | null;
  shipping_label_url?: string | null;
  shipped_at?: string | null;
  sale_channel?: SaleChannel | null;
  sold_date?: string | null;
  sold_price?: string | number | null;
  acquired_at?: string | null;
  cost_basis?: string | number | null;
  purchased_from?: PurchasedFrom | null;
  notes?: string | null;
  catalog_match_status?: CatalogMatchStatus | null;
  pending_card_match?: boolean | null;
  card: {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    set_code: string | null;
  };
}

type CardMatchResult = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
};

const TABS = [
  { id: "all", label: "All Items" },
  { id: "raw", label: "Raw" },
  { id: "damaged", label: "Damaged Card" },
  { id: "graded", label: "Graded Card" },
  { id: "sealed", label: "Sealed" },
] as const;

type InventoryTabId = (typeof TABS)[number]["id"];
type GradedFilter = "all" | GradedRating;

const STATUS_LABELS: Record<InventoryStatus, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

const CONDITION_LABELS: Record<InventoryType, string> = {
  raw: "Raw",
  damaged: "Damaged",
  graded: "Graded",
  sealed: "Sealed",
};

const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  not_sold: "Not Sold",
  ebay: "Ebay",
  fb: "FB",
  instagram: "Instagram",
  in_person: "In Person",
  traded: "Traded",
};

const PURCHASED_FROM_LABELS: Record<PurchasedFrom, string> = {
  facebook: "Facebook",
  ebay: "Ebay",
  instagram: "Instagram",
  direct_person: "Direct Person",
  event: "Event",
};

const ROW_NUMBER_LABEL = "Card #";
const ROW_NUMBER_COLUMN_CLASS = "w-[82px]";
const ROW_NUMBER_CELL_CLASS =
  "px-3 py-4 text-right align-top font-mono text-lg font-extrabold leading-none tabular-nums text-text";
const NESTED_ROW_NUMBER_CELL_CLASS =
  "px-3 py-3.5 text-right align-top font-mono text-lg font-extrabold leading-none tabular-nums text-owl";
const TABLE_IMAGE_COLUMN_CLASS = "w-[120px]";
const TABLE_IMAGE_CELL_CLASS = "px-3 py-2";
const NESTED_TABLE_IMAGE_BUTTON_CLASS = "mx-auto flex w-fit flex-col items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-owl";

type InventoryGroup = {
  key: string;
  rows: InventoryRow[];
  first: InventoryRow;
  quantity: number;
  condition: InventoryType | null;
  status: InventoryStatus | null;
};

type StageOrderItem = CustomerOrderSummary["items"][number];

type OrderDraft = {
  customer_name: string;
  shipping_label: string;
  tracking_number: string;
};

type OrderEditField = keyof OrderDraft;

type CreatedInventoryItem = Pick<
  InventoryRow,
  "id" | "created_at" | "inventory_type" | "status" | "quantity" | "item_nickname" | "graded_rating" | "certification_number"
  | "custom_image_front_url" | "custom_image_back_url" | "customer_name" | "shipping_tracking" | "shipped_at"
  | "shipping_label_url" | "sale_channel" | "sold_date" | "sold_price" | "acquired_at" | "cost_basis" | "purchased_from"
  | "catalog_match_status"
>;

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

function EditIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

type HoverPreview = {
  src: string;
  name: string;
  x: number;
  y: number;
  isScanImage: boolean;
};

type ScanViewer = {
  cardName: string;
  certificationNumber: string | null;
  scans: { label: string; url: string }[];
  activeIndex: number;
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
    item.inventory_type,
    item.inventory_type === "graded" ? item.graded_rating ?? "NO_GRADE" : "NO_GRADE",
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

  if (normalized.includes("FEDEX.COM")) {
    return "FedEx";
  }

  if (normalized.includes("DHL.COM")) {
    return "DHL";
  }

  return null;
}

function isLocalOnlyItem(id: string) {
  return id.startsWith("preview-") || id.startsWith("temp-");
}

function cardImageUrl(item: InventoryRow) {
  return item.custom_image_front_url ?? item.card.image_url_small ?? item.card.image_url;
}

function cardImageFallbackUrl(item: InventoryRow) {
  if (item.custom_image_front_url) return item.card.image_url_small ?? item.card.image_url ?? null;
  return null;
}

function hasCustomScanImage(item: InventoryRow) {
  return Boolean(item.custom_image_front_url);
}

function createdAtSortValue(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function formatOrderDate(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function orderItemTitle(item: StageOrderItem) {
  return item.item_nickname || item.card.name || "Untitled inventory item";
}

function orderItemImageUrl(item: StageOrderItem) {
  return item.custom_image_front_url ?? item.card.image_url_small ?? item.card.image_url;
}

function orderItemImageFallbackUrl(item: StageOrderItem) {
  if (item.custom_image_front_url) return item.card.image_url_small ?? item.card.image_url ?? null;
  return null;
}

function orderItemHasCustomScanImage(item: StageOrderItem) {
  return Boolean(item.custom_image_front_url);
}

function orderItemConditionLabel(item: StageOrderItem) {
  return CONDITION_LABELS[item.inventory_type] ?? item.inventory_type;
}

function orderMatchesSearch(order: CustomerOrderSummary, query: string) {
  if (!query) return true;

  return [
    order.id,
    order.nickname,
    order.customer_name,
    order.tracking_number,
    order.shipping_label,
    ...order.items.flatMap((item) => [
      item.id,
      item.item_nickname,
      item.card.name,
      item.card.set_code,
      item.card.card_number,
      item.inventory_type,
      item.status,
      item.graded_rating,
      item.certification_number,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function itemMatchesInventoryTab(
  item: Pick<InventoryRow, "inventory_type" | "graded_rating">,
  tab: InventoryTabId,
  gradedFilter: GradedFilter
) {
  if (tab === "all") return true;
  if (item.inventory_type !== tab) return false;
  return tab !== "graded" || gradedFilter === "all" || item.graded_rating === gradedFilter;
}

function setCodeForMatch(card: CardMatchResult) {
  const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
  return set?.code ?? null;
}

function cardFromMatch(card: CardMatchResult): InventoryRow["card"] {
  return {
    name: card.name,
    image_url: card.image_url,
    image_url_small: card.image_url_small,
    card_number: card.card_number,
    set_code: setCodeForMatch(card),
  };
}

function catalogMatchStatus(item: Pick<InventoryRow, "catalog_match_status" | "pending_card_match">): CatalogMatchStatus {
  return item.catalog_match_status ?? (item.pending_card_match ? "needs_match" : "custom_verified");
}

function needsCatalogMatch(item: Pick<InventoryRow, "catalog_match_status" | "pending_card_match">) {
  return catalogMatchStatus(item) === "needs_match";
}

function withCatalogMatchStatus<T extends InventoryRow>(item: T, status: CatalogMatchStatus): T {
  return {
    ...item,
    catalog_match_status: status,
    pending_card_match: status === "needs_match",
  };
}

export default function InventoryTabs({
  items,
  orders = [],
  ordersError = null,
  onItemsChange,
  onOrdersChange,
  statusFilter = "all",
  onStatusFilterChange,
}: {
  items: InventoryRow[];
  orders?: CustomerOrderSummary[];
  ordersError?: string | null;
  onItemsChange?: (items: InventoryRow[]) => void;
  onOrdersChange?: (orders: CustomerOrderSummary[]) => void;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (status: StatusFilter) => void;
}) {
  const [activeTab, setActiveTab] = useState<InventoryTabId>("all");
  const [gradedFilter, setGradedFilter] = useState<GradedFilter>("all");
  const [rows, setRows] = useState(items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [customerNameDrafts, setCustomerNameDrafts] = useState<Record<string, string>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [shippingLabelDrafts, setShippingLabelDrafts] = useState<Record<string, string>>({});
  const [editingShippingLabelIds, setEditingShippingLabelIds] = useState<Record<string, boolean>>({});
  const [confirmingShippedIds, setConfirmingShippedIds] = useState<Record<string, boolean>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>({});
  const [editingOrderFields, setEditingOrderFields] = useState<Record<string, Partial<Record<OrderEditField, boolean>>>>({});
  const [savingOrderIds, setSavingOrderIds] = useState<Record<string, boolean>>({});
  const [confirmingShippedOrderIds, setConfirmingShippedOrderIds] = useState<Record<string, boolean>>({});
  const [addingGroups, setAddingGroups] = useState<Record<string, boolean>>({});
  const [deletingItemIds, setDeletingItemIds] = useState<Record<string, boolean>>({});
  const [confirmingDeleteIds, setConfirmingDeleteIds] = useState<Record<string, boolean>>({});
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [lastSelectedItemId, setLastSelectedItemId] = useState<string | null>(null);
  const [bulkDeleteStep, setBulkDeleteStep] = useState<0 | 1 | 2>(0);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [openActionMenuKey, setOpenActionMenuKey] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [scanViewer, setScanViewer] = useState<ScanViewer | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingMatchOnly, setPendingMatchOnly] = useState(false);
  const [matchQueries, setMatchQueries] = useState<Record<string, string>>({});
  const [matchResults, setMatchResults] = useState<Record<string, CardMatchResult[]>>({});
  const [searchingMatchIds, setSearchingMatchIds] = useState<Record<string, boolean>>({});
  const [matchingItemIds, setMatchingItemIds] = useState<Record<string, boolean>>({});
  const [matchErrors, setMatchErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const showTracking = statusFilter === "ship" || statusFilter === "sold";
  const showShippingActions = statusFilter === "ship";
  const showSaleFields = statusFilter === "sold";
  const standardTableMinWidth = showSaleFields ? "min-w-[1360px]" : "min-w-[1020px]";

  useEffect(() => {
    onItemsChange?.(rows);
  }, [onItemsChange, rows]);

  useEffect(() => {
    if (activeTab !== "graded" && gradedFilter !== "all") {
      setGradedFilter("all");
    }
  }, [activeTab, gradedFilter]);

  useEffect(() => {
    const timers = Object.entries(matchQueries).map(([itemId, query]) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return null;

      return window.setTimeout(() => {
        const item = rows.find((row) => row.id === itemId);
        if (item && needsCatalogMatch(item)) {
          searchMatchCandidates(item, trimmed);
        }
      }, 250);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
    // matchQueries and rows are the intended debounce inputs; the search helper reads the current item/query when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchQueries, rows]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPendingMatchOnly(params.get("review") === "needs-match");
  }, []);

  useEffect(() => {
    if (!pendingMatchOnly || statusFilter === "all") return;
    setPendingMatchOnly(false);
    window.history.replaceState(null, "", window.location.pathname);
  }, [pendingMatchOnly, statusFilter]);

  function setNeedsMatchReview(next: boolean) {
    setPendingMatchOnly(next);
    if (next) {
      setActiveTab("all");
      onStatusFilterChange?.("all");
    }
    const url = next ? `${window.location.pathname}?review=needs-match` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  const statusFilteredRows = useMemo(() => {
    if (pendingMatchOnly) {
      return rows.filter((item) => needsCatalogMatch(item));
    }

    return rows.filter((item) => {
      return statusFilter === "all" || item.status === statusFilter;
    });
  }, [pendingMatchOnly, rows, statusFilter]);

  const cardNumbers = useMemo(() => {
    const sorted = rows
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const createdAtDiff = createdAtSortValue(a.item.created_at) - createdAtSortValue(b.item.created_at);
        if (createdAtDiff !== 0) return createdAtDiff;

        const idDiff = a.item.id.localeCompare(b.item.id);
        return idDiff || a.index - b.index;
      });

    return new Map(sorted.map(({ item }, index) => [item.id, index + 1]));
  }, [rows]);

  function inventoryCardNumber(item: InventoryRow) {
    return cardNumbers.get(item.id);
  }

  function inventoryCardLabel(item: InventoryRow) {
    const cardNumber = inventoryCardNumber(item);
    return cardNumber ? `${ROW_NUMBER_LABEL} ${cardNumber}` : ROW_NUMBER_LABEL;
  }

  const itemMatchesSearch = useCallback((item: InventoryRow, query: string) => {
    const cardNumber = cardNumbers.get(item.id);
    const cardLabel = cardNumber ? `${ROW_NUMBER_LABEL} ${cardNumber}` : null;
    const matchStatus = catalogMatchStatus(item);

    return (
      [
        item.item_nickname,
        item.card.name,
        item.card.set_code,
        item.card.card_number,
        item.id,
        cardLabel,
        cardNumber?.toString(),
        item.inventory_type,
        item.status,
        item.graded_rating,
        item.certification_number,
        item.sale_channel,
        item.customer_name,
        item.purchased_from,
        item.purchased_from ? PURCHASED_FROM_LABELS[item.purchased_from] : null,
        item.shipping_tracking,
        item.shipping_label_url,
        item.notes,
        matchStatus,
        matchStatus.replace("_", " "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [cardNumbers]);

  const searchFilteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return statusFilteredRows;

    return statusFilteredRows.filter((item) => itemMatchesSearch(item, query));
  }, [itemMatchesSearch, searchQuery, statusFilteredRows]);

  const filtered = useMemo(() => {
    if (pendingMatchOnly) return searchFilteredRows;
    return searchFilteredRows.filter((item) => itemMatchesInventoryTab(item, activeTab, gradedFilter));
  }, [activeTab, gradedFilter, pendingMatchOnly, searchFilteredRows]);

  const currentStageOrderItemIds = useMemo(() => {
    if (statusFilter !== "ship" && statusFilter !== "sold") return new Set<string>();

    const shipped = statusFilter === "sold";
    return new Set(
      orders
        .filter((order) => order.marked_shipped === shipped)
        .flatMap((order) => order.inventory_item_ids)
    );
  }, [orders, statusFilter]);

  const tableRows = useMemo(() => {
    if (currentStageOrderItemIds.size === 0) return filtered;
    return filtered.filter((item) => !currentStageOrderItemIds.has(item.id));
  }, [currentStageOrderItemIds, filtered]);

  const groups = useMemo<InventoryGroup[]>(() => {
    const map = new Map<string, InventoryRow[]>();
    for (const item of tableRows) {
      const key = pendingMatchOnly ? `item:${item.id}` : groupKey(item);
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
  }, [pendingMatchOnly, tableRows]);

  const visibleRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const selectedIds = useMemo(
    () => Object.entries(selectedItemIds).filter(([, selected]) => selected).map(([id]) => id),
    [selectedItemIds]
  );
  const selectedCount = selectedIds.length;
  const visibleSelectedCount = visibleRows.reduce((sum, item) => sum + (selectedItemIds[item.id] ? 1 : 0), 0);
  const allVisibleSelected = visibleRows.length > 0 && visibleSelectedCount === visibleRows.length;

  const countRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const baseRows = rows.filter((item) => statusFilter === "all" || item.status === statusFilter);
    if (!query) return baseRows;
    return baseRows.filter((item) => itemMatchesSearch(item, query));
  }, [itemMatchesSearch, rows, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    return countRows.reduce(
      (acc, item) => {
        acc.all += item.quantity;
        acc[item.inventory_type] += item.quantity;
        return acc;
      },
      { all: 0, raw: 0, damaged: 0, graded: 0, sealed: 0 }
    );
  }, [countRows]);
  const gradedCounts = useMemo(() => {
    return countRows.reduce(
      (acc, item) => {
        if (item.inventory_type === "graded" && item.graded_rating) {
          acc[item.graded_rating] = (acc[item.graded_rating] ?? 0) + item.quantity;
        }
        return acc;
      },
      {} as Record<GradedRating, number>
    );
  }, [countRows]);
  const visibleGradedFilters = useMemo(
    () => GRADED_RATINGS.filter((rating) => (gradedCounts[rating] ?? 0) > 0 || gradedFilter === rating),
    [gradedCounts, gradedFilter]
  );

  const pendingMatchCount = useMemo(() => {
    return rows.reduce((sum, item) => sum + (needsCatalogMatch(item) ? item.quantity : 0), 0);
  }, [rows]);
  const showNeedsMatchTab = pendingMatchCount > 0;
  const stageOrders = useMemo(() => {
    if (statusFilter !== "ship" && statusFilter !== "sold") return [];

    const query = searchQuery.trim().toLowerCase();
    const shipped = statusFilter === "sold";

    return orders
      .filter((order) => order.marked_shipped === shipped)
      .filter((order) => order.items.some((item) => itemMatchesInventoryTab(item, activeTab, gradedFilter)))
      .filter((order) => orderMatchesSearch(order, query));
  }, [activeTab, gradedFilter, orders, searchQuery, statusFilter]);
  const stageOrderCardCount = useMemo(
    () => stageOrders.reduce((sum, order) => sum + order.items.length, 0),
    [stageOrders]
  );

  useEffect(() => {
    if (!pendingMatchOnly || pendingMatchCount > 0) return;
    setPendingMatchOnly(false);
    window.history.replaceState(null, "", window.location.pathname);
  }, [pendingMatchOnly, pendingMatchCount]);

  useEffect(() => {
    const availableIds = new Set(rows.map((row) => row.id));
    setSelectedItemIds((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => availableIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [rows]);

  const selectedGroup = useMemo<InventoryGroup | null>(() => {
    if (!selectedGroupKey) return null;
    const groupRows = selectedGroupKey.startsWith("item:")
      ? rows.filter((item) => item.id === selectedGroupKey.slice(5))
      : rows.filter((item) => groupKey(item) === selectedGroupKey);
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

  type InventoryItemUpdates = Partial<Pick<InventoryRow, "status" | "graded_rating" | "certification_number" | "custom_image_front_url" | "custom_image_back_url" | "inventory_type" | "item_nickname" | "customer_name" | "shipping_tracking" | "shipping_label_url" | "shipped_at" | "sale_channel" | "sold_date" | "sold_price" | "acquired_at" | "cost_basis" | "purchased_from" | "notes" | "catalog_match_status" | "pending_card_match">>;

  async function updateItem(
    id: string,
    updates: InventoryItemUpdates
  ) {
    const normalizedUpdates =
      updates.catalog_match_status
        ? { ...updates, pending_card_match: updates.catalog_match_status === "needs_match" }
        : updates;

    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...normalizedUpdates } : item))
    );

    if (isLocalOnlyItem(id)) {
      return;
    }

    const res = await fetch(`/api/admin/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedUpdates),
    });

    if (!res.ok) {
      setRows(items);
    }
  }

  function orderDraft(order: CustomerOrderSummary): OrderDraft {
    return orderDrafts[order.id] ?? {
      customer_name: order.customer_name ?? "",
      shipping_label: order.shipping_label ?? "",
      tracking_number: order.tracking_number ?? "",
    };
  }

  function updateOrderDraft(orderId: string, field: keyof OrderDraft, value: string) {
    const order = orders.find((candidate) => candidate.id === orderId);
    setOrderDrafts((current) => ({
      ...current,
      [orderId]: {
        customer_name: current[orderId]?.customer_name ?? order?.customer_name ?? "",
        shipping_label: current[orderId]?.shipping_label ?? order?.shipping_label ?? "",
        tracking_number: current[orderId]?.tracking_number ?? order?.tracking_number ?? "",
        [field]: value,
      },
    }));
  }

  function isOrderFieldEditing(orderId: string, field: OrderEditField) {
    return editingOrderFields[orderId]?.[field] ?? false;
  }

  function setOrderFieldEditing(orderId: string, field: OrderEditField, editing: boolean) {
    setEditingOrderFields((current) => {
      const next = { ...current };
      const orderFields = { ...(next[orderId] ?? {}) };
      if (editing) {
        orderFields[field] = true;
      } else {
        delete orderFields[field];
      }

      if (Object.keys(orderFields).length > 0) {
        next[orderId] = orderFields;
      } else {
        delete next[orderId];
      }

      return next;
    });
  }

  async function saveOrderQuickEdit(order: CustomerOrderSummary, options: { markedShipped?: boolean } = {}) {
    if (savingOrderIds[order.id]) return;

    const draft = orderDraft(order);
    const customerName = draft.customer_name.trim();
    const shippingLabel = draft.shipping_label.trim();
    const trackingNumber = draft.tracking_number.trim();
    const markedShipped = options.markedShipped ?? order.marked_shipped;

    if (!customerName) {
      setActionError("Customer name is required before saving an order.");
      return;
    }

    setActionError(null);
    setSavingOrderIds((current) => ({ ...current, [order.id]: true }));

    const updatedAt = new Date().toISOString();
    const shippedAt = markedShipped ? updatedAt : null;
    const nextOrder: CustomerOrderSummary = {
      ...order,
      customer_name: customerName,
      shipping_label: shippingLabel || null,
      tracking_number: trackingNumber || null,
      marked_shipped: markedShipped,
      updated_at: updatedAt,
      items: order.items.map((item) => ({
        ...item,
        status: markedShipped ? "sold" : "ship",
        customer_name: customerName,
        shipping_label_url: shippingLabel || null,
        shipping_tracking: trackingNumber || null,
        shipped_at: shippedAt,
      })),
    };

    onOrdersChange?.(orders.map((candidate) => (candidate.id === order.id ? nextOrder : candidate)));
    setRows((current) =>
      current.map((row) =>
        order.inventory_item_ids.includes(row.id)
          ? {
              ...row,
              status: markedShipped ? "sold" : "ship",
              customer_name: customerName,
              shipping_label_url: shippingLabel || null,
              shipping_tracking: trackingNumber || null,
              shipped_at: shippedAt,
            }
          : row
      )
    );

    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: order.nickname ?? "",
          customer_name: customerName,
          shipping_label: shippingLabel,
          marked_shipped: markedShipped,
          tracking_number: trackingNumber,
          inventory_item_ids: order.inventory_item_ids,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not save order.");
      }

      setOrderDrafts((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setEditingOrderFields((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setConfirmingShippedOrderIds((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    } catch (error) {
      onOrdersChange?.(orders);
      setRows(items);
      setActionError(error instanceof Error ? error.message : "Could not save order.");
    } finally {
      setSavingOrderIds((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    }
  }

  function initialMatchQuery(item: InventoryRow) {
    return [item.card.set_code, item.card.card_number, item.card.name].filter(Boolean).join(" ").trim();
  }

  async function searchMatchCandidates(item: InventoryRow, queryOverride?: string) {
    const query = (queryOverride ?? matchQueries[item.id] ?? initialMatchQuery(item)).trim();
    if (query.length < 2 || searchingMatchIds[item.id]) return;

    setMatchErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setSearchingMatchIds((current) => ({ ...current, [item.id]: true }));

    try {
      const res = await fetch(`/api/admin/cards/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error("Search failed");
      }

      const data = (await res.json()) as CardMatchResult[];
      setMatchResults((current) => ({ ...current, [item.id]: data }));
      if (data.length === 0) {
        setMatchErrors((current) => ({ ...current, [item.id]: "No matching catalog cards found." }));
      }
    } catch {
      setMatchErrors((current) => ({ ...current, [item.id]: "Could not search the card catalog." }));
    } finally {
      setSearchingMatchIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }

  async function applyCardMatch(item: InventoryRow, card: CardMatchResult) {
    if (matchingItemIds[item.id]) return;

    setMatchErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setMatchingItemIds((current) => ({ ...current, [item.id]: true }));

    const matchedCard = cardFromMatch(card);
    setRows((current) =>
      current.map((row) =>
        row.id === item.id
          ? {
              ...withCatalogMatchStatus(row, "matched"),
              card: matchedCard,
            }
          : row
      )
    );

    if (isLocalOnlyItem(item.id)) {
      setMatchingItemIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: card.id,
          catalog_match_status: "matched",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save card match");
      }

      setMatchQueries((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMatchResults((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch {
      setRows((current) => current.map((row) => (row.id === item.id ? item : row)));
      setMatchErrors((current) => ({ ...current, [item.id]: "Could not save the card match." }));
    } finally {
      setMatchingItemIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }

  function updateCustomVerified(item: InventoryRow, checked: boolean) {
    if (catalogMatchStatus(item) === "matched") return;

    const nextStatus: CatalogMatchStatus = checked ? "custom_verified" : "needs_match";
    updateItem(item.id, { catalog_match_status: nextStatus });

    if (checked) {
      setMatchQueries((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMatchResults((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMatchErrors((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }

  async function addIndividualItem(group: InventoryGroup) {
    if (addingGroups[group.key]) return;

    const source = group.first;
    const tempId = `temp-${source.id}-${Date.now()}`;
    const newItem: InventoryRow = {
      ...source,
      id: tempId,
      created_at: new Date().toISOString(),
      quantity: 1,
      item_nickname: source.item_nickname ?? null,
      certification_number: source.certification_number ?? null,
      custom_image_front_url: source.custom_image_front_url ?? null,
      custom_image_back_url: source.custom_image_back_url ?? null,
      customer_name: source.customer_name ?? null,
      shipping_tracking: null,
      shipping_label_url: null,
      shipped_at: null,
      sale_channel: source.sale_channel ?? "not_sold",
      sold_date: source.sold_date ?? null,
      sold_price: source.sold_price ?? null,
      acquired_at: source.acquired_at ?? null,
      cost_basis: source.cost_basis ?? null,
      purchased_from: source.purchased_from ?? null,
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
                created_at: created.created_at ?? newItem.created_at,
                inventory_type: created.inventory_type,
                status: created.status,
                quantity: created.quantity,
                item_nickname: created.item_nickname ?? null,
                graded_rating: created.graded_rating,
                certification_number: created.certification_number ?? null,
                custom_image_front_url: created.custom_image_front_url ?? null,
                custom_image_back_url: created.custom_image_back_url ?? null,
                customer_name: created.customer_name ?? null,
                shipping_tracking: created.shipping_tracking ?? null,
                shipping_label_url: created.shipping_label_url ?? null,
                shipped_at: created.shipped_at ?? null,
                sale_channel: created.sale_channel ?? "not_sold",
                sold_date: created.sold_date ?? null,
                sold_price: created.sold_price ?? null,
                acquired_at: created.acquired_at ?? null,
                cost_basis: created.cost_basis ?? null,
                purchased_from: created.purchased_from ?? null,
                catalog_match_status: created.catalog_match_status ?? newItem.catalog_match_status,
                pending_card_match: (created.catalog_match_status ?? newItem.catalog_match_status) === "needs_match",
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

  function clearBulkSelection() {
    setBulkSelectMode(false);
    setSelectedItemIds({});
    setLastSelectedItemId(null);
    setBulkDeleteStep(0);
  }

  function applyRangeSelection(targetIds: string[], selected: boolean) {
    const anchorIndex = lastSelectedItemId ? visibleRows.findIndex((item) => item.id === lastSelectedItemId) : -1;
    const targetIndexes = targetIds
      .map((id) => visibleRows.findIndex((item) => item.id === id))
      .filter((index) => index >= 0);

    if (anchorIndex < 0 || targetIndexes.length === 0) return false;

    const start = Math.min(anchorIndex, ...targetIndexes);
    const end = Math.max(anchorIndex, ...targetIndexes);
    setSelectedItemIds((current) => {
      const next = { ...current };
      for (const item of visibleRows.slice(start, end + 1)) {
        if (selected) next[item.id] = true;
        else delete next[item.id];
      }
      return next;
    });
    return true;
  }

  function setGroupSelected(group: InventoryGroup, selected: boolean, shiftKey = false) {
    const groupIds = group.rows.map((item) => item.id);
    if (shiftKey && applyRangeSelection(groupIds, selected)) {
      setLastSelectedItemId(groupIds[groupIds.length - 1] ?? null);
      setBulkDeleteStep(0);
      return;
    }

    setSelectedItemIds((current) => {
      const next = { ...current };
      for (const item of group.rows) {
        if (selected) next[item.id] = true;
        else delete next[item.id];
      }
      return next;
    });
    setLastSelectedItemId(groupIds[groupIds.length - 1] ?? null);
    setBulkDeleteStep(0);
  }

  function setItemSelected(item: InventoryRow, selected: boolean, shiftKey = false) {
    if (shiftKey && applyRangeSelection([item.id], selected)) {
      setLastSelectedItemId(item.id);
      setBulkDeleteStep(0);
      return;
    }

    setSelectedItemIds((current) => {
      const next = { ...current };
      if (selected) next[item.id] = true;
      else delete next[item.id];
      return next;
    });
    setLastSelectedItemId(item.id);
    setBulkDeleteStep(0);
  }

  function setAllVisibleSelected(selected: boolean) {
    setSelectedItemIds((current) => {
      const next = { ...current };
      for (const item of visibleRows) {
        if (selected) next[item.id] = true;
        else delete next[item.id];
      }
      return next;
    });
    setBulkDeleteStep(0);
  }

  async function deleteSelectedItems() {
    if (bulkDeleting || selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const persistedIds = selectedIds.filter((id) => !isLocalOnlyItem(id));
    const previousRows = rows;

    setActionError(null);
    setBulkDeleting(true);
    setRows((current) => current.filter((item) => !selectedSet.has(item.id)));

    try {
      if (persistedIds.length > 0) {
        const res = await fetch("/api/admin/inventory", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: persistedIds }),
        });
        if (!res.ok) throw new Error("Failed to delete selected inventory items");
      }
      clearBulkSelection();
    } catch {
      setRows(previousRows);
      setActionError("Could not delete the selected inventory items. Try again.");
    } finally {
      setBulkDeleting(false);
    }
  }

  function handleBulkDeleteClick() {
    if (selectedCount === 0 || bulkDeleting) return;
    if (bulkDeleteStep < 2) {
      setBulkDeleteStep((current) => (current + 1) as 0 | 1 | 2);
      return;
    }
    deleteSelectedItems();
  }

  function selectionStateFor(group: InventoryGroup) {
    const selectedInGroup = group.rows.filter((item) => selectedItemIds[item.id]).length;
    return {
      selectedInGroup,
      isSelected: selectedInGroup === group.rows.length,
      isPartiallySelected: selectedInGroup > 0 && selectedInGroup < group.rows.length,
    };
  }

  function groupSelectionClass(group: InventoryGroup) {
    return group.rows.some((item) => selectedItemIds[item.id])
      ? "border-owl/60 bg-[rgba(245,166,35,0.18)] shadow-[inset_4px_0_0_rgba(245,166,35,0.95)]"
      : "border-border hover:bg-surf2/70";
  }

  function nestedRowSelectionClass(item: InventoryRow) {
    return selectedItemIds[item.id]
      ? "border-owl/60 bg-[rgba(245,166,35,0.18)] shadow-[inset_4px_0_0_rgba(245,166,35,0.95)]"
      : "border-[rgba(79,142,247,0.16)] bg-[rgba(79,142,247,0.075)] shadow-[inset_3px_0_0_rgba(79,142,247,0.45)] hover:bg-[rgba(79,142,247,0.11)]";
  }

  function renderSelectionCell(group: InventoryGroup, label: string) {
    const { selectedInGroup, isSelected, isPartiallySelected } = selectionStateFor(group);

    if (!bulkSelectMode) return null;

    return (
      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-owl/40 bg-owl/10 text-owl hover:bg-owl/15">
        <input
          type="checkbox"
          checked={isSelected}
          ref={(input) => {
            if (input) input.indeterminate = isPartiallySelected;
          }}
          onChange={(event) =>
            setGroupSelected(
              group,
              event.target.checked,
              Boolean((event.nativeEvent as globalThis.MouseEvent).shiftKey),
            )
          }
          className="h-4 w-4 accent-owl"
          aria-label={label}
        />
        {isPartiallySelected && (
          <span className="sr-only">{selectedInGroup} selected</span>
        )}
      </label>
    );
  }

  function renderItemSelectionCell(item: InventoryRow, label: string) {
    if (!bulkSelectMode) return null;

    return (
      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-owl/40 bg-owl/10 text-owl hover:bg-owl/15">
        <input
          type="checkbox"
          checked={Boolean(selectedItemIds[item.id])}
          onChange={(event) =>
            setItemSelected(
              item,
              event.target.checked,
              Boolean((event.nativeEvent as globalThis.MouseEvent).shiftKey),
            )
          }
          className="h-4 w-4 accent-owl"
          aria-label={label}
        />
      </label>
    );
  }

  function renderSelectionHeader() {
    if (!bulkSelectMode) return null;

    return (
      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-owl/40 bg-owl/10 text-owl hover:bg-owl/15">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          ref={(input) => {
            if (input) input.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
          }}
          onChange={(event) => setAllVisibleSelected(event.target.checked)}
          className="h-4 w-4 accent-owl"
          aria-label="Select all visible inventory items"
        />
      </label>
    );
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
        className="inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-loss/70 bg-loss/10 px-2.5 py-1.5 font-mono text-xs font-black uppercase leading-none tracking-wider text-loss transition-colors hover:border-loss hover:bg-loss/15 disabled:cursor-wait disabled:opacity-60"
      >
        X Remove Item
      </button>
    );
  }

  function renderRowActions({
    group,
    item,
    canAdd = false,
    canRemove = false,
  }: {
    group: InventoryGroup;
    item: InventoryRow;
    canAdd?: boolean;
    canRemove?: boolean;
  }) {
    const key = `${group.key}:${item.id}`;
    const isOpen = openActionMenuKey === key;
    const isAdding = addingGroups[group.key] ?? false;
    const isConfirmingDelete = confirmingDeleteIds[item.id] ?? false;
    const isDeleting = deletingItemIds[item.id] ?? false;

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          title="Inventory actions"
          aria-label="Inventory actions"
          onClick={() => setOpenActionMenuKey((current) => (current === key ? null : key))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-2 bg-surface font-mono text-lg font-black leading-none text-text-2 transition-colors hover:border-owl hover:text-owl"
        >
          ...
        </button>

        {isOpen && (
          <div className="absolute right-0 top-10 z-40 rounded-lg border border-border bg-deep p-2 shadow-2xl">
            {isConfirmingDelete && canRemove ? (
              <div className="w-[230px] space-y-2 p-1">
                <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                  Remove item?
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      deleteItem(item);
                      setOpenActionMenuKey(null);
                    }}
                    className="flex-1 rounded-md border border-loss bg-loss/10 px-2.5 py-1.5 text-center font-mono text-xs font-bold uppercase tracking-wider text-loss transition-colors hover:bg-loss/15 disabled:cursor-wait disabled:opacity-60"
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
                    className="flex-1 rounded-md border border-border-2 bg-surface px-2.5 py-1.5 text-center font-mono text-xs font-bold uppercase tracking-wider text-text-2 transition-colors hover:text-text disabled:cursor-wait disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-w-[230px] gap-2">
                {canAdd && (
                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={() => {
                      addIndividualItem(group);
                      setOpenActionMenuKey(null);
                    }}
                    className="flex-1 rounded-md px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-wider text-gain transition-colors hover:bg-[rgba(0,214,143,0.10)] disabled:cursor-wait disabled:opacity-60"
                  >
                    Add item
                  </button>
                )}

                {canRemove && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setConfirmingDeleteIds((current) => ({ ...current, [item.id]: true }))}
                    className="flex-1 rounded-md px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-wider text-loss transition-colors hover:bg-loss/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    Remove item
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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

  function urlHref(value?: string | null) {
    if (!value) return null;
    return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
  }

  function orderTrackingHref(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trackingHref(trimmed) ?? `https://www.google.com/search?q=${encodeURIComponent(`${trimmed} tracking`)}`;
  }

  function todayDateString() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }

  function updateSaleChannel(item: InventoryRow, nextChannel: SaleChannel) {
    updateItem(item.id, {
      sale_channel: nextChannel,
      status: nextChannel === "not_sold" ? "sale" : item.status === "sold" ? "sold" : "ship",
      sold_date: nextChannel === "not_sold" ? null : item.sold_date ?? todayDateString(),
    });
  }

  function markItemShipped(item: InventoryRow) {
    updateItem(item.id, {
      status: "sold",
      shipped_at: item.shipped_at ?? new Date().toISOString(),
      sold_date: item.sold_date ?? todayDateString(),
    });
    setConfirmingShippedIds((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }

  function renderSaleFields(item: InventoryRow) {
    const channel = item.sale_channel ?? "not_sold";
    const soldDate = item.sold_date ?? "";

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

  function renderTrackingCell(item: InventoryRow) {
    if (item.shipping_tracking) {
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs font-semibold text-gain">
            Tracking
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
            })
          }
          className="rounded-md border border-owl bg-owl/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-owl disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-3"
        >
          Save Tracking
        </button>
        <div className="font-mono text-xs font-semibold text-text-2">Not shipped yet</div>
      </div>
    );
  }

  function renderShippingLabelCell(item: InventoryRow) {
    const savedLabel = item.shipping_label_url?.trim() ?? "";
    const draftValue = shippingLabelDrafts[item.id] ?? savedLabel;
    const href = urlHref(savedLabel);
    const isEditing = editingShippingLabelIds[item.id] ?? !savedLabel;

    if (!isEditing && href) {
      return (
        <div className="flex items-center gap-2">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md border border-blue bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue transition-colors hover:bg-blue/15"
          >
            Print Shipping
          </a>
          <button
            type="button"
            title="Edit shipping label"
            aria-label="Edit shipping label"
            onClick={() => {
              setShippingLabelDrafts((current) => ({ ...current, [item.id]: savedLabel }));
              setEditingShippingLabelIds((current) => ({ ...current, [item.id]: true }));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-2 bg-surface text-text-2 transition-colors hover:border-blue hover:text-blue"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              />
              <path
                d="m14 8 2 2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              />
            </svg>
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <input
          value={draftValue}
          onChange={(event) =>
            setShippingLabelDrafts((current) => ({
              ...current,
              [item.id]: event.target.value,
            }))
          }
          placeholder="Paste ship label URL or note"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-owl"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={draftValue.trim() === savedLabel}
            onClick={() => {
              updateItem(item.id, { shipping_label_url: draftValue.trim() || null });
              setEditingShippingLabelIds((current) => {
                const next = { ...current };
                delete next[item.id];
                return next;
              });
            }}
            className="rounded-md border border-owl bg-owl/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-owl disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-3"
          >
            Confirm Change
          </button>
          {savedLabel && (
            <button
              type="button"
              onClick={() => {
                setShippingLabelDrafts((current) => ({ ...current, [item.id]: savedLabel }));
                setEditingShippingLabelIds((current) => {
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                });
              }}
              className="rounded-md border border-border-2 bg-surface px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-2 hover:text-text"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderCustomerNameCell(item: InventoryRow) {
    const savedName = item.customer_name?.trim() ?? "";
    const draftValue = customerNameDrafts[item.id] ?? savedName;

    return (
      <div className="space-y-2">
        <input
          value={draftValue}
          onChange={(event) =>
            setCustomerNameDrafts((current) => ({
              ...current,
              [item.id]: event.target.value,
            }))
          }
          placeholder="Customer name"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-owl"
        />
        <button
          type="button"
          disabled={draftValue.trim() === savedName}
          onClick={() => updateItem(item.id, { customer_name: draftValue.trim() || null })}
          className="rounded-md border border-owl bg-owl/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-owl disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-3"
        >
          Save Name
        </button>
      </div>
    );
  }

  function renderShippedCell(item: InventoryRow) {
    const isConfirming = confirmingShippedIds[item.id] ?? false;

    if (isConfirming) {
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs font-semibold text-text-2">
            Move this item to Sold?
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => markItemShipped(item)}
              className="rounded-md border border-blue bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue hover:bg-blue/15"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirmingShippedIds((current) => {
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                })
              }
              className="rounded-md border border-border-2 bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setConfirmingShippedIds((current) => ({ ...current, [item.id]: true }))}
        className="rounded-md border border-blue bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue hover:bg-blue/15"
      >
        Mark Shipped
      </button>
    );
  }

  function renderConditionControls(item: InventoryRow) {
    return (
      <>
        <SelectField
          value={item.inventory_type}
          onChange={(event) =>
            updateItem(item.id, {
              inventory_type: event.target.value as InventoryType,
              ...(event.target.value === "graded"
                ? {}
                : { graded_rating: null, certification_number: null }),
            })
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
        {item.inventory_type === "graded" && (
          <div className="mt-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
              Certification Number
            </span>
            <input
              type="text"
              value={item.certification_number ?? ""}
              onChange={(event) => updateItem(item.id, { certification_number: event.target.value })}
              placeholder="PSA cert number"
              aria-label="Certification number"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none transition-colors hover:border-border-2 hover:bg-surf2 focus:border-owl focus:bg-surf2"
            />
          </div>
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

  function renderCardTitle(item: InventoryRow, titleClassName = "text-base font-bold text-text") {
    return (
      <div className="min-w-0">
        {item.item_nickname && (
          <div className="mb-0.5 truncate font-mono text-xs font-bold uppercase tracking-wider text-owl">
            {item.item_nickname}
          </div>
        )}
        <div className={`truncate ${titleClassName}`}>{item.card.name ?? "Unknown Card"}</div>
      </div>
    );
  }

  function renderInventoryCardBadge(item: InventoryRow) {
    return (
      <span
        title={`${inventoryCardLabel(item)} - Inventory item ID: ${item.id}`}
        className="inline-flex items-center rounded-full border border-owl/50 bg-owl px-2.5 py-1 font-mono text-[11px] font-black uppercase leading-none tracking-wider text-void shadow-[0_0_14px_rgba(245,166,35,0.28)]"
      >
        {inventoryCardLabel(item)}
      </span>
    );
  }

  function renderCardMeta(
    item: InventoryRow,
    {
      groupLabel,
      quantity,
      itemIndex,
      showCardBadge = true,
      showItemId = false,
    }: {
      groupLabel?: string;
      quantity?: number;
      itemIndex?: number;
      showCardBadge?: boolean;
      showItemId?: boolean;
    } = {}
  ) {
    return (
      <div className="mt-1.5 flex flex-col items-start gap-1 font-mono text-xs font-medium text-text-2">
        <div className="flex flex-wrap items-center gap-2">
          {typeof itemIndex === "number" && <span>#{itemIndex}</span>}
          {item.card.set_code && <span>{item.card.set_code}</span>}
          {item.card.card_number && <span>{item.card.card_number}</span>}
          {item.graded_rating && <span>{item.graded_rating}</span>}
          {typeof quantity === "number" && (
            <span className="rounded bg-surf3 px-2 py-0.5 text-text">Qty {quantity}</span>
          )}
        </div>
        {groupLabel && (
          <span className="rounded bg-surf3 px-2 py-0.5 text-text">{groupLabel}</span>
        )}
        {showCardBadge && renderInventoryCardBadge(item)}
        {item.certification_number && <span>Cert {item.certification_number}</span>}
        {needsCatalogMatch(item) && (
          <span className="rounded border border-owl/40 bg-owl/10 px-2 py-0.5 text-owl">
            NEEDS MATCH
          </span>
        )}
        {showItemId && <span className="truncate">{item.id}</span>}
      </div>
    );
  }

  function renderCatalogMatchStatusControl(item: InventoryRow, className = "") {
    const status = catalogMatchStatus(item);
    const isMatched = status === "matched";

    return (
      <label
        className={`flex items-start gap-3 rounded-lg border border-border bg-deep p-3 ${className} ${
          isMatched ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-border-2"
        }`}
      >
        <input
          type="checkbox"
          checked={status === "custom_verified"}
          disabled={isMatched}
          onChange={(event) => updateCustomVerified(item, event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-owl disabled:cursor-not-allowed"
        />
        <span className="min-w-0">
          <span className="block font-mono text-xs font-bold uppercase tracking-wider text-text">
            Not in catalog
          </span>
          <span className="mt-1 block text-sm text-text-2">
            This is a real item and does not need catalog matching.
          </span>
        </span>
      </label>
    );
  }

  function renderMatchControls(item: InventoryRow) {
    if (!needsCatalogMatch(item)) return null;

    const query = matchQueries[item.id] ?? initialMatchQuery(item);
    const results = matchResults[item.id] ?? [];
    const isSearching = searchingMatchIds[item.id] ?? false;
    const isMatching = matchingItemIds[item.id] ?? false;
    const error = matchErrors[item.id];

    return (
      <div className="mt-3 rounded-lg border border-owl/40 bg-owl/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-owl">
              Catalog Card Match Lookup
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setMatchQueries((current) => ({ ...current, [item.id]: event.target.value }));
                setMatchResults((current) => {
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                });
                setMatchErrors((current) => {
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                });
              }}
              placeholder="Search by card name or card number"
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 text-sm text-text outline-none focus:border-owl"
            />
          </label>
          <button
            type="button"
            disabled={query.trim().length < 2 || isSearching}
            onClick={() => searchMatchCandidates(item)}
            className="rounded-md border border-owl bg-owl/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15 disabled:cursor-wait disabled:border-border disabled:bg-surface disabled:text-text-3"
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
        </div>

        {renderCatalogMatchStatusControl(item, "mt-3")}

        {error && (
          <div className="mt-3 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-sm font-semibold text-text">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {results.map((card) => (
              <button
                key={card.id}
                type="button"
                disabled={isMatching}
                onClick={() => applyCardMatch(item, card)}
                className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-deep p-3 text-left transition-colors hover:border-owl hover:bg-surf2 disabled:cursor-wait disabled:opacity-60"
              >
                {card.image_url || card.image_url_small ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image_url_small ?? card.image_url ?? ""}
                    alt=""
                    className="h-16 w-11 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-surf3 font-mono text-[10px] text-text-2">
                    BOX
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-text">{card.name ?? "Unknown Card"}</div>
                  <div className="mt-1 flex flex-wrap gap-2 font-mono text-xs text-text-2">
                    {setCodeForMatch(card) && <span>{setCodeForMatch(card)}</span>}
                    {card.card_number && <span>{card.card_number}</span>}
                    {card.rarity && <span>{card.rarity}</span>}
                  </div>
                </div>
                <span className="shrink-0 rounded border border-owl/60 bg-owl/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-owl">
                  {isMatching ? "Saving" : "Use"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderCardImage(item: InventoryRow, size: "table" | "modal" | "small" = "table") {
    const imageUrl = cardImageUrl(item);
    const isScanImage = hasCustomScanImage(item);
    const dimensions = isScanImage
      ? size === "modal"
        ? "h-96 w-72"
        : size === "small"
          ? "h-28 w-20"
          : "h-32 w-24"
      : size === "modal"
        ? "h-80 w-56"
        : size === "small"
          ? "h-24 w-16"
          : "h-32 w-24";
    const imageFitClass = size === "modal"
      ? isScanImage
        ? "object-contain p-1"
        : "object-cover"
      : "object-contain";

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
          data-fallback-src={cardImageFallbackUrl(item) ?? undefined}
          onError={(event) => {
            const fallbackSrc = event.currentTarget.dataset.fallbackSrc;
            if (fallbackSrc && event.currentTarget.src !== fallbackSrc) {
              event.currentTarget.src = fallbackSrc;
              delete event.currentTarget.dataset.fallbackSrc;
              return;
            }
            event.currentTarget.style.display = "none";
          }}
          className={`h-full w-full ${imageFitClass}`}
        />
      </div>
    );
  }

  function renderScanImages(item: InventoryRow) {
    const scans = [
      { label: "Front", url: item.custom_image_front_url },
      { label: "Back", url: item.custom_image_back_url },
    ].filter((scan): scan is { label: string; url: string } => Boolean(scan.url));

    if (scans.length === 0) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-3">
        {scans.map((scan, index) => (
          <button
            key={scan.label}
            type="button"
            onClick={() =>
              setScanViewer({
                cardName: item.card.name ?? "Card scan",
                certificationNumber: item.certification_number ?? null,
                scans,
                activeIndex: index,
              })
            }
            className="group block w-20 rounded-md border border-border bg-deep p-1 transition-colors hover:border-owl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scan.url}
              alt={`${scan.label} scan`}
              className="h-24 w-full rounded object-contain"
            />
            <div className="mt-1 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-text-2 group-hover:text-owl">
              {scan.label}
            </div>
          </button>
        ))}
      </div>
    );
  }

  function updateHoverPreview(event: MouseEvent, item: InventoryRow) {
    const imageUrl = cardImageUrl(item);
    if (!imageUrl) return;

    const isScanImage = hasCustomScanImage(item);
    const previewWidth = isScanImage ? 320 : 260;
    const previewHeight = isScanImage ? 430 : 360;
    const margin = 18;
    const x = Math.min(event.clientX + margin, window.innerWidth - previewWidth - margin);
    const y = Math.min(event.clientY + margin, window.innerHeight - previewHeight - margin);

    setHoverPreview({
      src: imageUrl,
      name: item.card.name ?? "Card image",
      x: Math.max(margin, x),
      y: Math.max(margin, y),
      isScanImage,
    });
  }

  function updateOrderItemHoverPreview(event: MouseEvent, item: StageOrderItem) {
    const imageUrl = orderItemImageUrl(item);
    if (!imageUrl) return;

    const isScanImage = orderItemHasCustomScanImage(item);
    const previewWidth = isScanImage ? 320 : 260;
    const previewHeight = isScanImage ? 430 : 360;
    const margin = 18;
    const x = Math.min(event.clientX + margin, window.innerWidth - previewWidth - margin);
    const y = Math.min(event.clientY + margin, window.innerHeight - previewHeight - margin);

    setHoverPreview({
      src: imageUrl,
      name: orderItemTitle(item),
      x: Math.max(margin, x),
      y: Math.max(margin, y),
      isScanImage,
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
          className={`rounded-md ${hoverPreview.isScanImage ? "h-[410px] w-[300px] object-contain" : "h-[340px] w-[238px] object-cover"}`}
        />
        <div className={`mt-2 truncate font-mono text-xs font-semibold text-text ${hoverPreview.isScanImage ? "max-w-[300px]" : "max-w-[238px]"}`}>
          {hoverPreview.name}
        </div>
      </div>
    );
  }

  function renderScanViewer() {
    if (!scanViewer) return null;

    const activeScan = scanViewer.scans[scanViewer.activeIndex] ?? scanViewer.scans[0];
    if (!activeScan) return null;

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 py-8">
        <div className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-border bg-deep shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">{activeScan.label} Scan</div>
              <div className="mt-1 truncate text-xl font-bold text-text">{scanViewer.cardName}</div>
              {scanViewer.certificationNumber && (
                <div className="mt-1 font-mono text-xs font-semibold text-text-2">Cert {scanViewer.certificationNumber}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setScanViewer(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-loss/70 bg-loss/15 text-loss transition-colors hover:bg-loss hover:text-void"
              aria-label="Close scan viewer"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[1fr_160px]">
            <div className="flex min-h-0 items-center justify-center rounded-md border border-border bg-black/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeScan.url}
                alt={`${activeScan.label} scan`}
                className="max-h-[72vh] max-w-full rounded-md object-contain"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto lg:flex-col lg:overflow-x-visible">
              {scanViewer.scans.map((scan, index) => (
                <button
                  key={scan.label}
                  type="button"
                  onClick={() => setScanViewer((current) => (current ? { ...current, activeIndex: index } : current))}
                  className={`shrink-0 rounded-md border bg-surface p-1 transition-colors ${
                    index === scanViewer.activeIndex
                      ? "border-owl text-owl"
                      : "border-border text-text-2 hover:border-border-2 hover:text-owl"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scan.url} alt={`${scan.label} scan thumbnail`} className="h-24 w-16 rounded object-contain" />
                  <div className="mt-1 text-center font-mono text-[10px] font-bold uppercase tracking-wider">
                    {scan.label}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setScanViewer(null)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue/70 bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue transition-colors hover:bg-blue hover:text-void"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
                </svg>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderInventoryDetailModal() {
    if (!selectedGroup) return null;

    const item = selectedGroup.first;

    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 pb-8 pt-[120px]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedGroupKey(null);
          }
        }}
      >
        <div className="w-full max-w-6xl rounded-lg border border-border bg-deep shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div>
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">Inventory Detail</div>
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
              {renderScanImages(item)}
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
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="shrink-0">
                        {renderCardImage(row, "small")}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-bold uppercase tracking-wider text-text">
                          Item #{index + 1}
                        </div>
                        <div className="mt-1">
                          {renderCardTitle(row, "text-lg font-bold leading-snug text-text")}
                        </div>
                        {renderCardMeta(row, { showItemId: true })}
                      </div>
                    </div>
                    {renderDeleteControls(row)}
                  </div>

                  {needsCatalogMatch(row)
                    ? renderMatchControls(row)
                    : renderCatalogMatchStatusControl(row, "mb-3")}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Nickname</span>
                      <input
                        type="text"
                        value={row.item_nickname ?? ""}
                        onChange={(event) => updateItem(row.id, { item_nickname: event.target.value })}
                        placeholder="Optional searchable item name"
                        className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm font-semibold text-text outline-none focus:border-owl"
                      />
                    </label>
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
                    <label className="block">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Purchased From</span>
                      <SelectField
                        value={row.purchased_from ?? ""}
                        onChange={(event) =>
                          updateItem(row.id, {
                            purchased_from: event.target.value ? (event.target.value as PurchasedFrom) : null,
                          })
                        }
                        wrapperClassName="mt-2"
                      >
                        <option value="">Select origin</option>
                        {(Object.keys(PURCHASED_FROM_LABELS) as PurchasedFrom[]).map((origin) => (
                          <option key={origin} value={origin}>
                            {PURCHASED_FROM_LABELS[origin]}
                          </option>
                        ))}
                      </SelectField>
                    </label>
                  </div>

                  {(row.status === "ship" || row.status === "sold") && (
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      {row.status === "ship" && (
                        <label className="block">
                          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Customer Name</span>
                          <div className="mt-2">{renderCustomerNameCell(row)}</div>
                        </label>
                      )}
                      <label className="block">
                        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Ship Label</span>
                        <div className="mt-2">{renderShippingLabelCell(row)}</div>
                      </label>
                      {row.status === "ship" && (
                        <label className="block">
                          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Shipped</span>
                          <div className="mt-2">{renderShippedCell(row)}</div>
                        </label>
                      )}
                      <label className="block">
                        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Tracking</span>
                        <div className="mt-2">{renderTrackingCell(row)}</div>
                      </label>
                    </div>
                  )}

                  {row.status === "sold" && (
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
                          value={row.sold_date ?? ""}
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
                  )}

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

              {selectedGroup.rows.length > 1 && (
                <button
                  type="button"
                  disabled={addingGroups[selectedGroup.key] ?? false}
                  onClick={() => addIndividualItem(selectedGroup)}
                  className="rounded-md border border-gain bg-[rgba(0,214,143,0.10)] px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-gain transition-colors hover:bg-[rgba(0,214,143,0.16)] disabled:cursor-wait disabled:opacity-60"
                >
                  Add Individual Item
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderOrderThumbnail(item: StageOrderItem) {
    const imageUrl = orderItemImageUrl(item);

    if (!imageUrl) {
      return (
        <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-surf3 font-mono text-xs font-semibold text-text-3">
          BOX
        </div>
      );
    }

    return (
      <div
        className="flex h-28 w-20 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-surf3 transition-transform hover:scale-[1.02]"
        onMouseEnter={(event) => updateOrderItemHoverPreview(event, item)}
        onMouseMove={(event) => updateOrderItemHoverPreview(event, item)}
        onMouseLeave={() => setHoverPreview(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={item.card.name ?? "Order card image"}
          data-fallback-src={orderItemImageFallbackUrl(item) ?? undefined}
          className="h-full w-full object-contain"
          onError={(event) => {
            const fallbackSrc = event.currentTarget.dataset.fallbackSrc;
            if (fallbackSrc && event.currentTarget.src !== fallbackSrc) {
              event.currentTarget.src = fallbackSrc;
              delete event.currentTarget.dataset.fallbackSrc;
              return;
            }
            event.currentTarget.style.display = "none";
          }}
        />
      </div>
    );
  }

  function renderStageOrdersSection() {
    if (statusFilter !== "ship" && statusFilter !== "sold") return null;

    const shippedStage = statusFilter === "sold";
    const title = shippedStage ? "Sold Orders" : "Orders";
    const emptyText = shippedStage ? "No shipped orders in Sold yet." : "No open orders need shipping yet.";

    return (
      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">{title}</h2>
            <p className="mt-1 text-sm text-text-2">
              {shippedStage
                ? "Customer orders marked shipped and moved into Sold."
                : "Customer order bundles waiting to ship."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-owl/30 bg-owl/10 px-3 py-2 font-mono text-xs font-bold uppercase text-owl">
              {stageOrders.length} Orders
            </span>
            <span className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-xs font-bold uppercase text-text-2">
              {stageOrderCardCount} Cards
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-3">
          {ordersError ? (
            <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-sm font-semibold text-text">
              Orders are not ready yet: {ordersError}
            </div>
          ) : stageOrders.length > 0 ? (
            stageOrders.map((order) => {
              const draft = orderDraft(order);
              const shippingLabelHref = urlHref(draft.shipping_label);
              const trackingLinkHref = orderTrackingHref(draft.tracking_number);
              const customerNameValue = draft.customer_name.trim();
              const trackingValue = draft.tracking_number.trim();
              const trackingCarrier = detectCarrier(trackingValue);
              const editingCustomerName = isOrderFieldEditing(order.id, "customer_name");
              const editingShippingLabel = isOrderFieldEditing(order.id, "shipping_label");
              const editingTracking = isOrderFieldEditing(order.id, "tracking_number");
              const isSavingOrder = savingOrderIds[order.id] ?? false;
              const isConfirmingShipped = confirmingShippedOrderIds[order.id] ?? false;
              const hasDraftChanges =
                draft.customer_name.trim() !== (order.customer_name ?? "") ||
                draft.shipping_label.trim() !== (order.shipping_label ?? "") ||
                draft.tracking_number.trim() !== (order.tracking_number ?? "");

              return (
              <div
                key={order.id}
                className="group grid min-w-0 gap-3 rounded-lg border border-border bg-deep p-3"
              >
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">{order.id}</div>
                    <a
                      href={`/admin/orders/${order.id}`}
                      className="mt-1 block truncate text-lg font-bold text-text underline-offset-2 transition-colors hover:text-owl hover:underline"
                    >
                      {order.nickname || order.customer_name}
                    </a>
                    <div className="mt-1 truncate text-sm text-text-2">{order.customer_name}</div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2.5">
                    <span
                      className={`rounded-md border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide sm:text-sm ${
                        order.marked_shipped
                          ? "border-gain/30 bg-gain/10 text-gain"
                          : "border-owl/30 bg-owl/10 text-owl"
                      }`}
                    >
                      {order.marked_shipped ? "Shipped" : "Open"}
                    </span>
                    <span className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-text-2 sm:text-sm">
                      {order.items.length} Cards
                    </span>
                    <span className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-text-2 sm:text-sm">
                      {formatOrderDate(order.updated_at ?? order.created_at)}
                    </span>
                    <a
                      href={`/admin/orders/${order.id}`}
                      className="rounded-md border border-border-2 bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-text transition-colors hover:border-owl hover:text-owl sm:text-sm"
                    >
                      Open Order
                    </a>
                  </div>
                </div>

                <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_520px] 2xl:grid-cols-[minmax(0,1fr)_640px]">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                    {order.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setHoverPreview(null);
                          setSelectedGroupKey(`item:${item.id}`);
                        }}
                        className="flex min-w-0 gap-4 rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-border-2 hover:bg-surf2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-owl"
                      >
                        {renderOrderThumbnail(item)}
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-3 text-base font-extrabold leading-snug text-text sm:text-lg">
                            {orderItemTitle(item)}
                          </div>
                          <div className="mt-3 grid gap-1.5 font-mono text-sm font-bold text-text-2">
                            <div>
                              Condition: <span className="text-text">{orderItemConditionLabel(item)}</span>
                            </div>
                            {item.inventory_type === "graded" && item.graded_rating && (
                              <div>
                                Rating: <span className="font-extrabold text-owl">{item.graded_rating}</span>
                              </div>
                            )}
                            {item.inventory_type === "graded" && item.certification_number && (
                              <div className="truncate">
                                Cert: <span className="font-extrabold text-owl">{item.certification_number}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 rounded-md border border-border bg-surface p-3">
                    <div className="block">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                        Customer Name
                      </span>
                      {customerNameValue && !editingCustomerName ? (
                        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-deep px-3 py-2.5">
                          <div className="min-w-0 truncate text-lg font-extrabold text-text">{customerNameValue}</div>
                          <button
                            type="button"
                            onClick={() => setOrderFieldEditing(order.id, "customer_name", true)}
                            className="shrink-0 rounded border border-border-2 bg-surface p-2 text-text-2 transition-colors hover:border-owl hover:text-owl"
                            aria-label="Edit customer name"
                            title="Edit customer name"
                          >
                            <EditIcon />
                          </button>
                        </div>
                      ) : (
                        <input
                          value={draft.customer_name}
                          onChange={(event) => updateOrderDraft(order.id, "customer_name", event.target.value)}
                          placeholder="Customer name"
                          className="mt-1.5 w-full rounded-md border border-border bg-deep px-3 py-2.5 text-sm text-text outline-none focus:border-owl"
                        />
                      )}
                    </div>

                    <div className="block">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                        Ship Label
                      </span>
                      {shippingLabelHref && !editingShippingLabel ? (
                        <div className="mt-1.5 flex min-w-0 items-center gap-2">
                          <a
                            href={shippingLabelHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-w-0 flex-1 items-center justify-center rounded-md border border-blue bg-blue px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-blue/90"
                          >
                            Print Shipping
                          </a>
                          <button
                            type="button"
                            onClick={() => setOrderFieldEditing(order.id, "shipping_label", true)}
                            className="shrink-0 rounded border border-border-2 bg-deep p-2.5 text-text-2 transition-colors hover:border-owl hover:text-owl"
                            aria-label="Edit shipping label URL"
                            title="Edit shipping label URL"
                          >
                            <EditIcon />
                          </button>
                        </div>
                      ) : (
                        <input
                          value={draft.shipping_label}
                          onChange={(event) => updateOrderDraft(order.id, "shipping_label", event.target.value)}
                          placeholder="Paste ship label URL"
                          className="mt-1.5 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-owl"
                        />
                      )}
                    </div>

                    <div className="block">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                        Tracking
                      </span>
                      {trackingValue && !editingTracking ? (
                        <div className="mt-1.5 flex min-w-0 items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-deep px-3 py-2.5">
                            <a
                              href={trackingLinkHref ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate font-mono text-sm font-extrabold text-owl underline underline-offset-2 transition-colors hover:text-owl-light"
                            >
                              {trackingValue}
                            </a>
                            {trackingCarrier && (
                              <span className="shrink-0 rounded border border-owl/40 bg-owl/10 px-2 py-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-owl">
                                {trackingCarrier}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setOrderFieldEditing(order.id, "tracking_number", true)}
                            className="shrink-0 rounded border border-border-2 bg-deep p-2.5 text-text-2 transition-colors hover:border-owl hover:text-owl"
                            aria-label="Edit tracking"
                            title="Edit tracking"
                          >
                            <EditIcon />
                          </button>
                        </div>
                      ) : (
                        <input
                          value={draft.tracking_number}
                          onChange={(event) => updateOrderDraft(order.id, "tracking_number", event.target.value)}
                          placeholder="Paste tracking code or link"
                          className="mt-1.5 w-full rounded-md border border-border bg-deep px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-owl"
                        />
                      )}
                    </div>

                    <div className="mt-3 grid gap-2">
                      {order.marked_shipped ? (
                        <div className="inline-flex items-center justify-center gap-2 rounded-md border border-gain bg-gain px-3 py-2.5 text-center font-mono text-xs font-extrabold uppercase tracking-wider text-void">
                          <span aria-hidden="true">📦</span>
                          <span>Marked Shipped</span>
                        </div>
                      ) : isConfirmingShipped ? (
                        <div className="grid gap-2">
                          <div className="font-mono text-xs font-bold uppercase tracking-wider text-gain">
                            Confirm move this order to Sold?
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isSavingOrder}
                              onClick={() => saveOrderQuickEdit(order, { markedShipped: true })}
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-gain bg-gain px-3 py-2.5 font-mono text-xs font-extrabold uppercase tracking-wider text-void transition-colors hover:bg-gain/90 disabled:cursor-wait disabled:opacity-60"
                            >
                              <span aria-hidden="true">📦</span>
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSavingOrder}
                              onClick={() =>
                                setConfirmingShippedOrderIds((current) => {
                                  const next = { ...current };
                                  delete next[order.id];
                                  return next;
                                })
                              }
                              className="rounded-md border border-border-2 bg-deep px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-2 transition-colors hover:text-text disabled:cursor-wait disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isSavingOrder}
                          onClick={() => setConfirmingShippedOrderIds((current) => ({ ...current, [order.id]: true }))}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-gain bg-gain px-3 py-2.5 font-mono text-xs font-extrabold uppercase tracking-wider text-void transition-colors hover:bg-gain/90 disabled:cursor-wait disabled:opacity-60"
                        >
                          <span aria-hidden="true">📦</span>
                          <span>Mark Shipped</span>
                        </button>
                      )}

                      {(hasDraftChanges || isSavingOrder) && (
                        <button
                          type="button"
                          disabled={isSavingOrder}
                          onClick={() => saveOrderQuickEdit(order)}
                          className="rounded-md border border-owl bg-owl/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isSavingOrder ? "Saving..." : "Save Order"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-2">
              {emptyText}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <form
          className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center xl:max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchQuery(searchDraft);
          }}
        >
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search inventory"
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text outline-none focus:border-owl"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 rounded-md bg-owl px-4 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
            >
              Search
            </button>
          {searchQuery && (
            <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setSearchQuery("");
                }}
                className="h-10 rounded-md border border-border bg-surface px-3 font-mono text-xs font-bold uppercase tracking-wider text-text hover:border-border-2 hover:text-owl"
              >
              Clear
            </button>
          )}
          {pendingMatchOnly && (
            <button
              type="button"
              onClick={() => {
                setNeedsMatchReview(false);
              }}
              className="h-10 rounded-md border border-border bg-surface px-3 font-mono text-xs font-bold uppercase tracking-wider text-text hover:border-border-2 hover:text-owl"
            >
              Clear Match
            </button>
          )}
        </div>
      </form>

        <div className="flex shrink-0 justify-start gap-2 xl:justify-end">
          <a
            href="/admin/inventory/import/psa"
            className="h-10 rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            PSA Import
          </a>
          <a
            href="/admin/orders/new"
            className="h-10 rounded-md border border-owl/40 bg-owl/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15"
          >
            Add Order
          </a>
          <a
            href="/admin/inventory/new"
            className="h-10 rounded-md bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            Add Inventory
          </a>
        </div>
      </div>

      {searchQuery && (
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
          Search: <span className="text-owl">{searchQuery}</span>
        </div>
      )}

      {pendingMatchOnly && (
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
          Review: <span className="text-owl">Needs Match</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setNeedsMatchReview(false);
              setActiveTab(tab.id);
            }}
            className={`rounded-md border px-4 py-2.5 font-mono text-sm font-semibold transition-colors ${
              activeTab === tab.id && !pendingMatchOnly
                ? "border-owl bg-owl/10 text-owl"
                : "border-border bg-surface text-text hover:border-border-2 hover:text-owl"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-text-2">{counts[tab.id]}</span>
          </button>
        ))}
        {showNeedsMatchTab && (
          <button
            type="button"
            onClick={() => {
              setNeedsMatchReview(!pendingMatchOnly);
            }}
            className={`rounded-md border px-4 py-2.5 font-mono text-sm font-semibold transition-colors ${
              pendingMatchOnly
                ? "border-owl bg-owl/10 text-owl"
                : "border-border bg-surface text-text hover:border-border-2 hover:text-owl"
            }`}
          >
            Needs Match
            <span className="ml-2 text-text-2">{pendingMatchCount}</span>
          </button>
        )}
      </div>

      {activeTab === "graded" && !pendingMatchOnly && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
          <button
            type="button"
            onClick={() => setGradedFilter("all")}
            className={`rounded-md border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
              gradedFilter === "all"
                ? "border-owl bg-owl/10 text-owl"
                : "border-border bg-deep text-text hover:border-border-2 hover:text-owl"
            }`}
          >
            All Grades
            <span className="ml-2 text-text-2">{counts.graded}</span>
          </button>
          {visibleGradedFilters.map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => setGradedFilter(rating)}
              className={`rounded-md border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                gradedFilter === rating
                  ? "border-owl bg-owl/10 text-owl"
                  : "border-border bg-deep text-text hover:border-border-2 hover:text-owl"
              }`}
            >
              {rating}
              <span className="ml-2 text-text-2">{gradedCounts[rating] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (bulkSelectMode) clearBulkSelection();
            else setBulkSelectMode(true);
          }}
          className={`rounded-md border px-4 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider transition-colors ${
            bulkSelectMode
              ? "border-owl bg-owl/10 text-owl"
              : "border-border bg-surface text-text hover:border-border-2 hover:text-owl"
          }`}
        >
          {bulkSelectMode ? "Cancel Selection" : "Select Items"}
        </button>
        {bulkSelectMode && (
          <>
            <div className="rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm font-semibold text-text">
              Selected <span className="text-owl">{selectedCount}</span>
            </div>
            {selectedCount > 0 && (
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={handleBulkDeleteClick}
                className={`rounded-md border px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  bulkDeleteStep === 0
                    ? "border-loss/60 bg-loss/10 text-loss hover:bg-loss/15"
                    : bulkDeleteStep === 1
                      ? "border-loss bg-loss/15 text-loss hover:bg-loss/20"
                      : "border-loss bg-loss text-void hover:bg-loss/90"
                }`}
              >
                {bulkDeleting
                  ? "Deleting..."
                  : bulkDeleteStep === 0
                    ? "Delete Selected"
                    : bulkDeleteStep === 1
                      ? "Confirm Delete"
                      : "Delete Permanently"}
              </button>
            )}
            {bulkDeleteStep > 0 && (
              <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm font-semibold text-text">
                {bulkDeleteStep === 1
                  ? `Confirm once more to delete ${selectedCount} selected item${selectedCount === 1 ? "" : "s"}.`
                  : "Final confirmation. This permanently removes the selected inventory records."}
              </div>
            )}
          </>
        )}
      </div>

      {actionError && (
        <div className="rounded-md border border-loss/30 bg-loss/10 px-4 py-3 text-sm font-semibold text-text">
          {actionError}
        </div>
      )}

      {renderStageOrdersSection()}

      {statusFilter === "ship" ? (
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[1260px] table-fixed">
          <colgroup>
            <col className={ROW_NUMBER_COLUMN_CLASS} />
            <col className="w-[48px]" />
            <col className={TABLE_IMAGE_COLUMN_CLASS} />
            <col className="w-[330px]" />
            <col className="w-[190px]" />
            <col className="w-[210px]" />
            <col className="w-[145px]" />
            <col className="w-[240px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surf2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-text">
              <th className="px-3 py-3.5 text-right">{ROW_NUMBER_LABEL}</th>
              <th className="px-3 py-3.5">{renderSelectionHeader()}</th>
              <th className="px-4 py-3.5">Image</th>
              <th className="px-3 py-3.5">Card</th>
              <th className="px-3 py-3.5">Customer Name</th>
              <th className="px-3 py-3.5">Ship Label</th>
              <th className="px-3 py-3.5">Shipped</th>
              <th className="px-3 py-3.5">Tracking</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const item = group.first;
              const hasNestedRows = group.rows.length > 1;
              const isOpen = hasNestedRows && (openGroups[group.key] ?? false);
              const isAdding = addingGroups[group.key] ?? false;

              return (
                <Fragment key={group.key}>
                  <tr className={`border-b ${groupSelectionClass(group)}`}>
                    <td className={ROW_NUMBER_CELL_CLASS}>
                      {inventoryCardNumber(item) ?? "-"}
                    </td>
                    <td className="px-3 py-4">
                      {bulkSelectMode ? renderSelectionCell(group, `Select ${item.card.name ?? "inventory group"}`) : hasNestedRows && (
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
                    <td className={TABLE_IMAGE_CELL_CLASS}>
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
                            {renderCardTitle(item)}
                          </button>
                          {renderCardMeta(item, {
                            groupLabel: hasNestedRows ? "GROUP" : undefined,
                            quantity: group.quantity,
                            showItemId: false,
                          })}
                        </div>
                        {renderRowActions({
                          group,
                          item,
                          canAdd: true,
                          canRemove: !hasNestedRows,
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-4 font-mono text-sm">
                      {group.rows.length === 1 ? (
                        renderCustomerNameCell(group.rows[0])
                      ) : (
                        <span className={group.rows.some((row) => row.customer_name) ? "font-semibold text-text" : "text-text-2"}>
                          {sameValue(group.rows.map((row) => row.customer_name ?? "")) || "Mixed"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 font-mono text-sm">
                      {group.rows.length === 1 ? (
                        renderShippingLabelCell(group.rows[0])
                      ) : (
                        <span className={group.rows.some((row) => row.shipping_label_url) ? "font-semibold text-owl" : "text-text-2"}>
                          {group.rows.some((row) => row.shipping_label_url) ? "Label saved" : "No label"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 font-mono text-sm">
                      {group.rows.length === 1 ? renderShippedCell(group.rows[0]) : "Open group"}
                    </td>
                    <td className="px-3 py-4 font-mono text-sm">
                      {group.rows.length === 1 ? (
                        renderTrackingCell(group.rows[0])
                      ) : (
                        <span className={group.rows.some((row) => row.shipping_tracking) ? "font-semibold text-gain" : "text-text-2"}>
                          {group.rows.some((row) => row.shipping_tracking) ? "Tracking saved" : "No tracking"}
                        </span>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <>
                      {group.rows.map((child, index) => (
                        <tr
                          key={child.id}
                          className={`border-b transition-colors ${nestedRowSelectionClass(child)}`}
                        >
                          <td className={NESTED_ROW_NUMBER_CELL_CLASS}>
                            {inventoryCardNumber(child) ?? "-"}
                          </td>
                          <td className="px-3 py-3.5">
                            {renderItemSelectionCell(child, `Select item ${index + 1}`)}
                          </td>
                          <td className={TABLE_IMAGE_CELL_CLASS}>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupKey(group.key)}
                              onMouseEnter={(event) => updateHoverPreview(event, child)}
                              onMouseMove={(event) => updateHoverPreview(event, child)}
                              onMouseLeave={() => setHoverPreview(null)}
                              className={NESTED_TABLE_IMAGE_BUTTON_CLASS}
                            >
                              {renderCardImage(child, "small")}
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
                                  {renderCardTitle(child, "text-base font-semibold text-text")}
                                </button>
                                {renderCardMeta(child, { showItemId: true })}
                              </div>
                              {renderRowActions({ group, item: child, canAdd: true, canRemove: true })}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">{renderCustomerNameCell(child)}</td>
                          <td className="px-3 py-3.5">{renderShippingLabelCell(child)}</td>
                          <td className="px-3 py-3.5">{renderShippedCell(child)}</td>
                          <td className="px-3 py-3.5">{renderTrackingCell(child)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-[rgba(79,142,247,0.16)] bg-[rgba(79,142,247,0.045)] shadow-[inset_3px_0_0_rgba(79,142,247,0.32)] last:border-b-0">
                        <td className="px-3 py-3.5" />
                        <td className="px-3 py-3.5" />
                        <td colSpan={6} className="px-3 py-3.5">
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
                <td colSpan={8} className="px-3 py-12 text-center text-base text-text-2">
                  No inventory items need shipping yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className={`w-full ${standardTableMinWidth} table-fixed`}>
          <colgroup>
            <col className={ROW_NUMBER_COLUMN_CLASS} />
            <col className="w-[48px]" />
            <col className={TABLE_IMAGE_COLUMN_CLASS} />
            <col className="w-[290px]" />
            <col className="w-[82px]" />
            {showTracking && <col className="w-[250px]" />}
            {showSaleFields && <col className="w-[145px]" />}
            {showSaleFields && <col className="w-[132px]" />}
            {showSaleFields && <col className="w-[118px]" />}
            <col className="w-[150px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surf2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-text">
              <th className="px-3 py-3.5 text-right">{ROW_NUMBER_LABEL}</th>
              <th className="px-3 py-3.5">{renderSelectionHeader()}</th>
              <th className="px-4 py-3.5">Image</th>
              <th className="px-3 py-3.5">Card Name</th>
              <th className="px-3 py-3.5 text-right">Quantity</th>
              {showShippingActions && <th className="px-3 py-3.5">Customer Name</th>}
              {showShippingActions && <th className="px-3 py-3.5">Ship Label</th>}
              {showShippingActions && <th className="px-3 py-3.5">Shipped</th>}
              {showTracking && <th className="px-3 py-3.5">Tracking</th>}
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
              const isOpen = hasNestedRows && (openGroups[group.key] ?? false);
              const isAdding = addingGroups[group.key] ?? false;

              return (
                <Fragment key={group.key}>
                  <tr className={`border-b ${groupSelectionClass(group)}`}>
                    <td className={ROW_NUMBER_CELL_CLASS}>
                      {inventoryCardNumber(item) ?? "-"}
                    </td>
                    <td className="px-3 py-4">
                      {bulkSelectMode ? renderSelectionCell(group, `Select ${item.card.name ?? "inventory group"}`) : hasNestedRows && (
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
                    <td className={TABLE_IMAGE_CELL_CLASS}>
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
                            {renderCardTitle(item)}
                          </button>
                          {renderCardMeta(item, { groupLabel: hasNestedRows ? "GROUP" : undefined })}
                        </div>
                        {renderRowActions({
                          group,
                          item,
                          canAdd: true,
                          canRemove: !hasNestedRows,
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right font-mono text-base font-semibold text-text">{group.quantity}</td>
                    {showShippingActions && (
                      <td className="px-3 py-4 font-mono text-sm">
                        {group.rows.length === 1 ? (
                          renderCustomerNameCell(group.rows[0])
                        ) : (
                          <span className={group.rows.some((row) => row.customer_name) ? "font-semibold text-text" : "text-text-2"}>
                            {sameValue(group.rows.map((row) => row.customer_name ?? "")) || "Mixed"}
                          </span>
                        )}
                      </td>
                    )}
                    {showShippingActions && (
                      <td className="px-3 py-4 font-mono text-sm">
                        {group.rows.length === 1 ? (
                          renderShippingLabelCell(group.rows[0])
                        ) : (
                          <span className={group.rows.some((row) => row.shipping_label_url) ? "font-semibold text-owl" : "text-text-2"}>
                            {group.rows.some((row) => row.shipping_label_url) ? "Label saved" : "No label"}
                          </span>
                        )}
                      </td>
                    )}
                    {showShippingActions && (
                      <td className="px-3 py-4 font-mono text-sm">
                        {group.rows.length === 1 ? renderShippedCell(group.rows[0]) : "Open group"}
                      </td>
                    )}
                    {showTracking && (
                      <td className="px-3 py-4 font-mono text-sm">
                        {group.rows.length === 1 ? (
                          renderTrackingCell(group.rows[0])
                        ) : (
                          <span className={group.rows.some((row) => row.shipping_tracking) ? "font-semibold text-gain" : "text-text-2"}>
                            {group.rows.some((row) => row.shipping_tracking) ? "Tracking saved" : "No tracking"}
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
                      {group.rows.map((child) => (
                        <tr
                          key={child.id}
                          className={`border-b transition-colors ${nestedRowSelectionClass(child)}`}
                        >
                          <td className={NESTED_ROW_NUMBER_CELL_CLASS}>
                            {inventoryCardNumber(child) ?? "-"}
                          </td>
                          <td className="px-3 py-3.5">
                            {renderItemSelectionCell(child, "Select inventory item")}
                          </td>
                          <td className={TABLE_IMAGE_CELL_CLASS}>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupKey(group.key)}
                              onMouseEnter={(event) => updateHoverPreview(event, child)}
                              onMouseMove={(event) => updateHoverPreview(event, child)}
                              onMouseLeave={() => setHoverPreview(null)}
                              className={NESTED_TABLE_IMAGE_BUTTON_CLASS}
                            >
                              {renderCardImage(child, "small")}
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
                                  {renderCardTitle(child, "text-base font-semibold text-text")}
                                </button>
                                {renderCardMeta(child, { showItemId: true })}
                              </div>
                              {renderRowActions({ group, item: child, canAdd: true, canRemove: true })}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-right font-mono text-base font-semibold text-text">{child.quantity}</td>
                          {showShippingActions && (
                            <td className="px-3 py-3.5">
                              {renderCustomerNameCell(child)}
                            </td>
                          )}
                          {showShippingActions && (
                            <td className="px-3 py-3.5">
                              {renderShippingLabelCell(child)}
                            </td>
                          )}
                          {showShippingActions && (
                            <td className="px-3 py-3.5">
                              {renderShippedCell(child)}
                            </td>
                          )}
                          {showTracking && (
                            <td className="px-3 py-3.5">
                              {renderTrackingCell(child)}
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
                        <td className="px-3 py-3.5" />
                        <td colSpan={(showTracking ? 6 : 5) + (showShippingActions ? 3 : 0) + (showSaleFields ? 3 : 0)} className="px-3 py-3.5">
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
                <td colSpan={(showTracking ? 8 : 7) + (showShippingActions ? 3 : 0) + (showSaleFields ? 3 : 0)} className="px-3 py-12 text-center text-base text-text-2">
                  No inventory items in this view yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      {renderHoverPreview()}
      {renderInventoryDetailModal()}
      {renderScanViewer()}
    </div>
  );
}
