import { createServiceClient } from "@/lib/supabase-server";
import type { GradedRating, InventoryStatus, InventoryType } from "@/lib/inventory-options";
import type { SaleChannel } from "@/lib/sale-options";
import type { BundleInventoryItem, InventoryBundleFormValue, InventoryBundleSummary } from "./bundle-types";

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type InventoryQueryRow = {
  id: string;
  created_at: string | null;
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  inventory_type: InventoryType;
  status: InventoryStatus;
  quantity: number;
  graded_rating: GradedRating | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
  sale_channel: SaleChannel | null;
  sold_date: string | null;
  sold_price: string | number | null;
};

type CardLookupRow = {
  id: string;
  name: string | null;
  image_url: string | null;
  image_url_small: string | null;
  card_number: string | null;
  sets: { code: string | null } | { code: string | null }[] | null;
};

type BundleRow = {
  id: string;
  name: string;
  notes: string | null;
  status: InventoryStatus;
  sale_channel: SaleChannel | null;
  sold_date: string | null;
  sold_price: string | number | null;
  created_at: string | null;
  updated_at: string | null;
};

type BundleItemRow = {
  bundle_id: string;
  inventory_item_id: string;
};

const INVENTORY_SELECT = `
  id, created_at, card_id, manual_card_name, manual_card_number, manual_set_code,
  item_nickname, inventory_type, status, quantity, graded_rating, certification_number,
  custom_image_front_url, custom_image_back_url, sale_channel, sold_date, sold_price
`;

const BUNDLE_SELECT = "id, name, notes, status, sale_channel, sold_date, sold_price, created_at, updated_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function toBundleFormValue(bundle: BundleRow, inventoryItemIds: string[]): InventoryBundleFormValue {
  return {
    id: bundle.id,
    name: bundle.name,
    notes: bundle.notes,
    status: bundle.status,
    sale_channel: bundle.sale_channel ?? "not_sold",
    sold_date: bundle.sold_date,
    sold_price: bundle.sold_price,
    inventory_item_ids: inventoryItemIds,
  };
}

function toInventoryItem(row: InventoryQueryRow, cardMap: Map<string, CardLookupRow>): BundleInventoryItem {
  const card = row.card_id ? cardMap.get(row.card_id) ?? null : null;
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;

  return {
    id: row.id,
    created_at: row.created_at,
    inventory_type: row.inventory_type,
    status: row.status,
    quantity: row.quantity,
    item_nickname: row.item_nickname,
    graded_rating: row.graded_rating,
    certification_number: row.certification_number,
    custom_image_front_url: row.custom_image_front_url,
    custom_image_back_url: row.custom_image_back_url,
    sale_channel: row.sale_channel,
    sold_date: row.sold_date,
    sold_price: row.sold_price,
    card: {
      name: card?.name ?? row.manual_card_name ?? null,
      image_url: card?.image_url ?? null,
      image_url_small: card?.image_url_small ?? null,
      card_number: card?.card_number ?? row.manual_card_number ?? null,
      set_code: set?.code ?? row.manual_set_code ?? null,
    },
  };
}

async function hydrateInventoryRows(rows: InventoryQueryRow[]): Promise<BundleInventoryItem[]> {
  const cardIds = Array.from(new Set(rows.map((row) => row.card_id).filter(Boolean))) as string[];
  if (cardIds.length === 0) {
    return rows.map((row) => toInventoryItem(row, new Map()));
  }

  const supabase = createServiceClient();
  const cardsRes = await supabase
    .from("cards")
    .select(`
      id, name, image_url, image_url_small, card_number,
      sets (code)
    `)
    .in("id", cardIds);

  if (cardsRes.error) {
    throw new Error(cardsRes.error.message);
  }

  const cardMap = new Map(((cardsRes.data ?? []) as unknown as CardLookupRow[]).map((card) => [card.id, card]));
  return rows.map((row) => toInventoryItem(row, cardMap));
}

export async function loadBundleInventory(currentBundleId?: string): Promise<LoadResult<BundleInventoryItem[]>> {
  try {
    const supabase = createServiceClient();
    const assignedRes = await supabase
      .from("inventory_bundle_items")
      .select("bundle_id, inventory_item_id");

    if (assignedRes.error) {
      return { data: [], error: assignedRes.error.message };
    }

    const assignedRows = (assignedRes.data ?? []) as BundleItemRow[];
    const currentBundleItemIds = new Set(
      assignedRows.filter((row) => row.bundle_id === currentBundleId).map((row) => row.inventory_item_id)
    );
    const blockedItemIds = new Set(
      assignedRows.filter((row) => row.bundle_id !== currentBundleId).map((row) => row.inventory_item_id)
    );

    const inventoryRes = await supabase
      .from("inventory_items")
      .select(INVENTORY_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (inventoryRes.error) {
      return { data: [], error: inventoryRes.error.message };
    }

    const rows = ((inventoryRes.data ?? []) as InventoryQueryRow[]).filter((row) => {
      if (blockedItemIds.has(row.id)) return false;
      if (currentBundleItemIds.has(row.id)) return true;
      return row.status !== "sold";
    });
    const items = await hydrateInventoryRows(rows);

    return { data: items, error: null };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function loadBundleSummaries(): Promise<LoadResult<InventoryBundleSummary[]>> {
  try {
    const supabase = createServiceClient();
    const bundlesRes = await supabase
      .from("inventory_bundles")
      .select(BUNDLE_SELECT)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (bundlesRes.error) {
      return { data: [], error: bundlesRes.error.message };
    }

    const bundles = (bundlesRes.data ?? []) as BundleRow[];
    if (bundles.length === 0) {
      return { data: [], error: null };
    }

    const bundleIds = bundles.map((bundle) => bundle.id);
    const linksRes = await supabase
      .from("inventory_bundle_items")
      .select("bundle_id, inventory_item_id")
      .in("bundle_id", bundleIds);

    if (linksRes.error) {
      return { data: [], error: linksRes.error.message };
    }

    const links = (linksRes.data ?? []) as BundleItemRow[];
    const inventoryIds = Array.from(new Set(links.map((link) => link.inventory_item_id)));
    let inventoryItems: BundleInventoryItem[] = [];

    if (inventoryIds.length > 0) {
      const inventoryRes = await supabase
        .from("inventory_items")
        .select(INVENTORY_SELECT)
        .in("id", inventoryIds);

      if (inventoryRes.error) {
        return { data: [], error: inventoryRes.error.message };
      }

      inventoryItems = await hydrateInventoryRows((inventoryRes.data ?? []) as InventoryQueryRow[]);
    }

    const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));
    const itemsByBundle = new Map<string, BundleInventoryItem[]>();
    links.forEach((link) => {
      const item = inventoryMap.get(link.inventory_item_id);
      if (!item) return;
      itemsByBundle.set(link.bundle_id, [...(itemsByBundle.get(link.bundle_id) ?? []), item]);
    });

    return {
      data: bundles.map((bundle) => ({
        ...toBundleFormValue(
          bundle,
          links.filter((link) => link.bundle_id === bundle.id).map((link) => link.inventory_item_id)
        ),
        created_at: bundle.created_at,
        updated_at: bundle.updated_at,
        items: itemsByBundle.get(bundle.id) ?? [],
      })),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function loadBundleForEdit(bundleId: string): Promise<LoadResult<InventoryBundleFormValue | null>> {
  try {
    const supabase = createServiceClient();
    const bundleRes = await supabase
      .from("inventory_bundles")
      .select(BUNDLE_SELECT)
      .eq("id", bundleId)
      .single();

    if (bundleRes.error) {
      return { data: null, error: bundleRes.error.message };
    }

    const linksRes = await supabase
      .from("inventory_bundle_items")
      .select("inventory_item_id")
      .eq("bundle_id", bundleId);

    if (linksRes.error) {
      return { data: null, error: linksRes.error.message };
    }

    return {
      data: toBundleFormValue(
        bundleRes.data as BundleRow,
        ((linksRes.data ?? []) as Pick<BundleItemRow, "inventory_item_id">[]).map((row) => row.inventory_item_id)
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}
