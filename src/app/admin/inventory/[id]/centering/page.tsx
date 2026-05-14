import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Card Centering Measurement - OWL Market",
};

type InventoryItemRow = {
  id: string;
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  inventory_type: string;
  status: string;
  quantity: number;
  graded_rating: string | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
};

type CardRow = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function loadInventoryItem(id: string) {
  const supabase = createServiceClient();
  const itemRes = await supabase
    .from("inventory_items")
    .select(
      "id, card_id, manual_card_name, manual_card_number, manual_set_code, item_nickname, inventory_type, status, quantity, graded_rating, certification_number, custom_image_front_url, custom_image_back_url"
    )
    .eq("id", id)
    .single();

  if (itemRes.error || !itemRes.data) {
    notFound();
  }

  const item = itemRes.data as InventoryItemRow;
  let card: CardRow | null = null;

  if (item.card_id) {
    const cardRes = await supabase
      .from("cards")
      .select("id, name, card_number, rarity, image_url, image_url_small, sets (code, name)")
      .eq("id", item.card_id)
      .single();

    if (!cardRes.error && cardRes.data) {
      card = cardRes.data as CardRow;
    }
  }

  return { item, card };
}

export default async function InventoryCenteringPage({
  params,
}: {
  params: { id: string };
}) {
  const { item, card } = await loadInventoryItem(params.id);
  const set = firstRelation(card?.sets);
  const cardName = card?.name ?? item.manual_card_name ?? "Unknown Card";
  const cardNumber = card?.card_number ?? item.manual_card_number;
  const setCode = set?.code ?? item.manual_set_code;
  const setName = set?.name;
  const rarity = card?.rarity;
  const frontScanUrl = item.custom_image_front_url;

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">
            Inventory Tool
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-text">
            Card Centering Measurement
          </h1>
          <p className="mt-2 max-w-3xl text-base text-text">
            This feature is being built. The CV service is deploying. You will be able to measure
            centering for this specific card here.
          </p>
        </div>
        <Link
          href="/admin/inventory"
          className="rounded-md border border-border bg-surface px-4 py-2.5 text-center font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
        >
          Back to Inventory
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-surface p-4">
          {frontScanUrl ? (
            <div>
              <div className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                Front Scan Preview
              </div>
              <div className="flex min-h-[420px] items-center justify-center rounded-md border border-border bg-black/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frontScanUrl}
                  alt={`${cardName} front scan`}
                  className="max-h-[520px] max-w-full rounded-md object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed border-border-2 bg-deep p-6 text-center">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                No Front Scan
              </div>
              <p className="mt-3 max-w-[260px] text-sm leading-6 text-text-2">
                This inventory item does not have a front scan yet. Upload UI is coming soon.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">
              Measuring This Inventory Item
            </div>
            {item.item_nickname && (
              <div className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-owl">
                {item.item_nickname}
              </div>
            )}
            <h2 className="mt-2 text-2xl font-bold leading-tight text-text">{cardName}</h2>
            <div className="mt-4 flex flex-wrap gap-2 font-mono text-xs font-bold uppercase tracking-wider">
              {setCode && (
                <span className="rounded-md border border-border bg-deep px-3 py-2 text-text">
                  {setCode}
                </span>
              )}
              {cardNumber && (
                <span className="rounded-md border border-border bg-deep px-3 py-2 text-text-2">
                  {cardNumber}
                </span>
              )}
              {rarity && (
                <span className="rounded-md border border-owl/40 bg-owl/10 px-3 py-2 text-owl">
                  {rarity}
                </span>
              )}
              {item.graded_rating && (
                <span className="rounded-md border border-blue/40 bg-blue/10 px-3 py-2 text-blue">
                  {item.graded_rating}
                </span>
              )}
            </div>
            {setName && <p className="mt-3 text-sm text-text-2">{setName}</p>}
            {item.certification_number && (
              <p className="mt-2 font-mono text-xs font-semibold text-text-2">
                Cert {item.certification_number}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-owl/40 bg-owl/10 p-5">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">
              CV Service Status
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text">
              Owl Lens contract and deployment wiring are in progress. This placeholder confirms the
              inventory route, auth protection, item lookup, and scan-preview data flow before the
              measurement workspace and proxy route are added.
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                Condition
              </div>
              <div className="mt-2 text-lg font-bold text-text">{titleCase(item.inventory_type)}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                Stage
              </div>
              <div className="mt-2 text-lg font-bold text-text">{titleCase(item.status)}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                Quantity
              </div>
              <div className="mt-2 text-lg font-bold text-text">{item.quantity}</div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
