import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAdminUser } from "@/lib/admin-user";
import { resolveGameScope } from "@/lib/game-scope";
import {
  isMissingPrivateCustomCardsError,
  loadPrivateCustomCardsByIds,
  type PrivateCustomCardRow,
} from "@/lib/private-custom-cards";
import type { GradedRating, InventoryStatus, InventoryType } from "@/lib/inventory-options";
import type { SaleChannel } from "@/lib/sale-options";
import type { CustomerOrderFormValue, CustomerOrderSummary, OrderInventoryItem } from "./order-types";

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type InventoryQueryRow = {
  id: string;
  created_at: string | null;
  card_id: string | null;
  custom_card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  inventory_type: InventoryType;
  status: InventoryStatus;
  graded_rating: GradedRating | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  customer_name: string | null;
  shipping_tracking: string | null;
  shipping_label_url: string | null;
  shipped_at: string | null;
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

type OrderRow = {
  id: string;
  nickname: string | null;
  customer_name: string;
  shipping_label: string | null;
  marked_shipped: boolean;
  tracking_number: string | null;
  sale_channel?: SaleChannel | null;
  sold_date?: string | null;
  sold_price?: string | number | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderItemRow = {
  order_id: string;
  inventory_item_id: string;
};

const INVENTORY_SELECT = `
  id, created_at, card_id, custom_card_id, manual_card_name, manual_card_number, manual_set_code,
  item_nickname, inventory_type, status, graded_rating, certification_number,
  custom_image_front_url, customer_name, shipping_tracking, shipping_label_url, shipped_at,
  sale_channel, sold_date, sold_price
`;

const ORDER_SELECT = "id, nickname, customer_name, shipping_label, marked_shipped, tracking_number, sale_channel, sold_date, sold_price, created_at, updated_at";
const LEGACY_ORDER_SELECT = "id, nickname, customer_name, shipping_label, marked_shipped, tracking_number, created_at, updated_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function resolveDefaultGameId(supabase: ReturnType<typeof createServiceClient>, game?: string | null) {
  const gameResult = await resolveGameScope(supabase, game, { defaultToOnePiece: true });
  if (gameResult.error) throw new Error(gameResult.error.message);
  return gameResult.game.id;
}

function toOrderFormValue(order: OrderRow, inventoryItemIds: string[]): CustomerOrderFormValue {
  return {
    id: order.id,
    nickname: order.nickname,
    customer_name: order.customer_name,
    shipping_label: order.shipping_label,
    marked_shipped: order.marked_shipped,
    tracking_number: order.tracking_number,
    sale_channel: order.sale_channel ?? "not_sold",
    sold_date: order.sold_date ?? null,
    sold_price: order.sold_price ?? null,
    inventory_item_ids: inventoryItemIds,
  };
}

function toInventoryItem(
  row: InventoryQueryRow,
  cardMap: Map<string, CardLookupRow>,
  customCardMap: Map<string, PrivateCustomCardRow>
): OrderInventoryItem {
  const card = row.card_id ? cardMap.get(row.card_id) ?? null : null;
  const customCard = row.custom_card_id ? customCardMap.get(row.custom_card_id) ?? null : null;
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;

  return {
    id: row.id,
    created_at: row.created_at,
    inventory_type: row.inventory_type,
    status: row.status,
    item_nickname: row.item_nickname,
    graded_rating: row.graded_rating,
    certification_number: row.certification_number,
    custom_image_front_url: row.custom_image_front_url,
    customer_name: row.customer_name,
    shipping_tracking: row.shipping_tracking,
    shipping_label_url: row.shipping_label_url,
    shipped_at: row.shipped_at,
    sale_channel: row.sale_channel,
    sold_date: row.sold_date,
    sold_price: row.sold_price,
    card: {
      name: card?.name ?? customCard?.name ?? row.manual_card_name ?? null,
      image_url: card?.image_url ?? customCard?.image_url ?? null,
      image_url_small: card?.image_url_small ?? customCard?.image_url_small ?? null,
      card_number: card?.card_number ?? customCard?.card_number ?? row.manual_card_number ?? null,
      set_code: set?.code ?? customCard?.set_code ?? row.manual_set_code ?? null,
    },
  };
}

async function hydrateInventoryRows(rows: InventoryQueryRow[], gameId: string): Promise<OrderInventoryItem[]> {
  const cardIds = Array.from(new Set(rows.map((row) => row.card_id).filter(Boolean))) as string[];
  const customCardIds = Array.from(new Set(rows.map((row) => row.custom_card_id).filter(Boolean))) as string[];
  const supabase = createServiceClient();
  let cardMap = new Map<string, CardLookupRow>();
  let customCardMap = new Map<string, PrivateCustomCardRow>();

  if (cardIds.length > 0) {
    const cardsRes = await supabase
      .from("cards")
      .select(`
        id, name, image_url, image_url_small, card_number,
        sets!cards_set_game_fk (code)
      `)
      .eq("game_id", gameId)
      .in("id", cardIds);

    if (cardsRes.error) {
      throw new Error(cardsRes.error.message);
    }

    cardMap = new Map(((cardsRes.data ?? []) as unknown as CardLookupRow[]).map((card) => [card.id, card]));
  }

  if (customCardIds.length > 0) {
    const currentUser = await getCurrentAdminUser();
    const customCardsRes = await loadPrivateCustomCardsByIds(supabase, currentUser?.id ?? null, customCardIds, gameId);
    if (customCardsRes.error && !isMissingPrivateCustomCardsError(customCardsRes.error)) {
      throw new Error(customCardsRes.error.message);
    }
    customCardMap = customCardsRes.cards;
  }

  return rows.map((row) => toInventoryItem(row, cardMap, customCardMap));
}

export async function loadOrderInventory(currentOrderId?: string, game?: string | null): Promise<LoadResult<OrderInventoryItem[]>> {
  try {
    const supabase = createServiceClient();
    const gameId = await resolveDefaultGameId(supabase, game);
    const assignedRes = await supabase
      .from("customer_order_items")
      .select("order_id, inventory_item_id")
      .eq("game_id", gameId);

    if (assignedRes.error) {
      return { data: [], error: assignedRes.error.message };
    }

    const assignedRows = (assignedRes.data ?? []) as OrderItemRow[];
    const currentOrderItemIds = new Set(
      assignedRows.filter((row) => row.order_id === currentOrderId).map((row) => row.inventory_item_id)
    );
    const blockedItemIds = new Set(
      assignedRows.filter((row) => row.order_id !== currentOrderId).map((row) => row.inventory_item_id)
    );

    const inventoryRes = await supabase
      .from("inventory_items")
      .select(INVENTORY_SELECT)
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (inventoryRes.error) {
      return { data: [], error: inventoryRes.error.message };
    }

    const rows = ((inventoryRes.data ?? []) as InventoryQueryRow[]).filter((row) => {
      if (blockedItemIds.has(row.id)) return false;
      if (currentOrderItemIds.has(row.id)) return true;
      return row.status !== "sold";
    });
    const items = await hydrateInventoryRows(rows, gameId);

    return { data: items, error: null };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function loadOrderSummaries(game?: string | null): Promise<LoadResult<CustomerOrderSummary[]>> {
  try {
    const supabase = createServiceClient();
    const gameId = await resolveDefaultGameId(supabase, game);
    const ordersRes = await supabase
      .from("customer_orders")
      .select(ORDER_SELECT)
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    let orderRows = ordersRes.data as OrderRow[] | null;
    let orderError = ordersRes.error;

    if (ordersRes.error) {
      const legacyOrdersRes = await supabase
        .from("customer_orders")
        .select(LEGACY_ORDER_SELECT)
        .eq("game_id", gameId)
        .order("created_at", { ascending: false });
      orderRows = legacyOrdersRes.data as OrderRow[] | null;
      orderError = legacyOrdersRes.error;
    }

    if (orderError) {
      return { data: [], error: orderError.message };
    }

    const orders = orderRows ?? [];
    if (orders.length === 0) {
      return { data: [], error: null };
    }

    const orderIds = orders.map((order) => order.id);
    const linksRes = await supabase
      .from("customer_order_items")
      .select("order_id, inventory_item_id")
      .eq("game_id", gameId)
      .in("order_id", orderIds);

    if (linksRes.error) {
      return { data: [], error: linksRes.error.message };
    }

    const links = (linksRes.data ?? []) as OrderItemRow[];
    const inventoryIds = Array.from(new Set(links.map((link) => link.inventory_item_id)));
    let inventoryItems: OrderInventoryItem[] = [];

    if (inventoryIds.length > 0) {
      const inventoryRes = await supabase
        .from("inventory_items")
        .select(INVENTORY_SELECT)
        .eq("game_id", gameId)
        .in("id", inventoryIds);

      if (inventoryRes.error) {
        return { data: [], error: inventoryRes.error.message };
      }

      inventoryItems = await hydrateInventoryRows((inventoryRes.data ?? []) as InventoryQueryRow[], gameId);
    }

    const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));
    const itemsByOrder = new Map<string, OrderInventoryItem[]>();
    links.forEach((link) => {
      const item = inventoryMap.get(link.inventory_item_id);
      if (!item) return;
      itemsByOrder.set(link.order_id, [...(itemsByOrder.get(link.order_id) ?? []), item]);
    });

    return {
      data: orders.map((order) => ({
        ...toOrderFormValue(order, links.filter((link) => link.order_id === order.id).map((link) => link.inventory_item_id)),
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: itemsByOrder.get(order.id) ?? [],
      })),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function loadOrderForEdit(orderId: string, game?: string | null): Promise<LoadResult<CustomerOrderFormValue | null>> {
  try {
    const supabase = createServiceClient();
    const gameId = await resolveDefaultGameId(supabase, game);
    const orderRes = await supabase
      .from("customer_orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .eq("game_id", gameId)
      .single();
    let orderRow = orderRes.data as OrderRow | null;
    let orderError = orderRes.error;

    if (orderRes.error) {
      const legacyOrderRes = await supabase
        .from("customer_orders")
        .select(LEGACY_ORDER_SELECT)
        .eq("id", orderId)
        .eq("game_id", gameId)
        .single();
      orderRow = legacyOrderRes.data as OrderRow | null;
      orderError = legacyOrderRes.error;
    }

    if (orderError) {
      return { data: null, error: orderError.message };
    }

    const linksRes = await supabase
      .from("customer_order_items")
      .select("inventory_item_id")
      .eq("order_id", orderId)
      .eq("game_id", gameId);

    if (linksRes.error) {
      return { data: null, error: linksRes.error.message };
    }

    return {
      data: toOrderFormValue(
        orderRow as OrderRow,
        ((linksRes.data ?? []) as Pick<OrderItemRow, "inventory_item_id">[]).map((row) => row.inventory_item_id)
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}
