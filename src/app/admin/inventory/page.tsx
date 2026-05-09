import InventoryShell from "./InventoryShell";
import { InventoryRow } from "./InventoryTabs";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory - OWL Market",
};

type InventoryQueryRow = {
  id: string;
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  pending_card_match: boolean | null;
  inventory_type: "raw" | "damaged" | "graded" | "sealed";
  status: "new" | "grading" | "sale" | "ship" | "sold";
  quantity: number;
  graded_rating: "TAG 10" | "PSA 10" | "PSA 9" | "BGS 10" | "BGS 9.5" | null;
  shipping_tracking: string | null;
  shipping_label_url: string | null;
  shipped_at: string | null;
  sale_channel: "not_sold" | "ebay" | "fb" | "instagram" | "in_person" | "traded" | null;
  sold_date: string | null;
  sold_price: string | number | null;
  acquired_at: string | null;
  cost_basis: string | number | null;
  notes: string | null;
};

type CardLookupRow = {
  id: string;
  name: string | null;
  image_url: string | null;
  image_url_small: string | null;
  card_number: string | null;
  sets: { code: string | null } | { code: string | null }[] | null;
};

function toInventoryRow(row: InventoryQueryRow, cardMap: Map<string, CardLookupRow>): InventoryRow {
  const card = row.card_id ? cardMap.get(row.card_id) ?? null : null;
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;

  return {
    id: row.id,
    inventory_type: row.inventory_type,
    status: row.status,
    quantity: row.quantity,
    item_nickname: row.item_nickname,
    graded_rating: row.graded_rating,
    shipping_tracking: row.shipping_tracking,
    shipping_label_url: row.shipping_label_url,
    shipped_at: row.shipped_at,
    sale_channel: row.sale_channel,
    sold_date: row.sold_date,
    sold_price: row.sold_price,
    acquired_at: row.acquired_at,
    cost_basis: row.cost_basis,
    notes: row.notes,
    card: {
      name: card?.name ?? row.manual_card_name ?? null,
      image_url: card?.image_url ?? null,
      image_url_small: card?.image_url_small ?? null,
      card_number: card?.card_number ?? row.manual_card_number ?? null,
      set_code: set?.code ?? row.manual_set_code ?? null,
    },
    pending_card_match: row.pending_card_match ?? false,
  };
}

export default async function AdminInventoryPage() {
  let supabase;
  let configError: string | null = null;

  try {
    supabase = createServiceClient();
  } catch (error) {
    configError = error instanceof Error ? error.message : "Supabase service client is not configured correctly.";
  }

  const { data, error } = supabase
    ? await supabase
        .from("inventory_items")
        .select(`
          id, card_id, manual_card_name, manual_card_number, manual_set_code, item_nickname, pending_card_match,
          inventory_type, status, quantity, graded_rating, shipping_tracking, shipping_label_url, shipped_at,
          sale_channel, sold_date, sold_price, acquired_at, cost_basis, notes
        `)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const inventoryRows = (data ?? []) as unknown as InventoryQueryRow[];
  const cardIds = Array.from(new Set(inventoryRows.map((row) => row.card_id).filter(Boolean))) as string[];
  let cardMap = new Map<string, CardLookupRow>();
  let cardError: { message: string } | null = null;

  if (supabase && cardIds.length > 0) {
    const cardsRes = await supabase
      .from("cards")
      .select(`
        id, name, image_url, image_url_small, card_number,
        sets (code)
      `)
      .in("id", cardIds);

    cardError = cardsRes.error;
    cardMap = new Map(((cardsRes.data ?? []) as unknown as CardLookupRow[]).map((card) => [card.id, card]));
  }

  const items = inventoryRows.map((row) => toInventoryRow(row, cardMap));
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="mx-auto max-w-[1920px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Inventory</h1>
          <p className="mt-2 max-w-2xl text-base text-text">
            Track cards by condition and movement stage: New, Grading, For Sale, Need Shipping, and Sold.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-right">
          <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Total Quantity</div>
          <div className="mt-1 text-3xl font-bold text-text">{totalQuantity}</div>
        </div>
      </div>

      {configError || error || cardError ? (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-base text-text">
          Inventory query failed: {configError ?? error?.message ?? cardError?.message}
        </div>
      ) : (
        <InventoryShell items={items} />
      )}
    </section>
  );
}
