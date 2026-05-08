import InventoryShell from "./InventoryShell";
import { InventoryRow } from "./InventoryTabs";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory - OWL Market",
};

type InventoryQueryRow = {
  id: string;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  pending_card_match: boolean | null;
  inventory_type: "raw" | "damaged" | "graded" | "sealed";
  status: "new" | "grading" | "sale" | "sold";
  quantity: number;
  graded_rating: "TAG 10" | "PSA 10" | "PSA 9" | "BGS 10" | "BGS 9.5" | null;
  shipping_tracking: string | null;
  shipped_at: string | null;
  sale_channel: "not_sold" | "ebay" | "fb" | "instagram" | "in_person" | "traded" | null;
  sold_date: string | null;
  sold_price: string | number | null;
  cards: {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    sets: { code: string | null } | { code: string | null }[] | null;
  } | {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    sets: { code: string | null } | { code: string | null }[] | null;
  }[] | null;
};

function toInventoryRow(row: InventoryQueryRow): InventoryRow {
  const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;

  return {
    id: row.id,
    inventory_type: row.inventory_type,
    status: row.status,
    quantity: row.quantity,
    graded_rating: row.graded_rating,
    shipping_tracking: row.shipping_tracking,
    shipped_at: row.shipped_at,
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
    pending_card_match: row.pending_card_match ?? false,
  };
}

export default async function AdminInventoryPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(`
      id, manual_card_name, manual_card_number, manual_set_code, pending_card_match,
      inventory_type, status, quantity, graded_rating, shipping_tracking, shipped_at,
      sale_channel, sold_date, sold_price,
      cards (
        name, image_url, image_url_small, card_number,
        sets (code)
      )
    `)
    .order("created_at", { ascending: false });

  const items = ((data ?? []) as unknown as InventoryQueryRow[]).map(toInventoryRow);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="mx-auto max-w-[1920px] px-2 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Inventory</h1>
          <p className="mt-2 max-w-2xl text-base text-text">
            Track cards by condition and movement stage: New, Grading, For Sale, and Sold.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-right">
          <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Total Quantity</div>
          <div className="mt-1 text-3xl font-bold text-text">{totalQuantity}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-base text-text">
          Inventory table is not ready yet. Run `schema-migration-v8-inventory.sql` in Supabase, then refresh this page.
        </div>
      ) : (
        <InventoryShell items={items} />
      )}
    </section>
  );
}
