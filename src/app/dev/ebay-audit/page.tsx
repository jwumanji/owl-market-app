import { createServiceClient } from "@/lib/supabase-server";
import EbayAuditPicker, { type PickerCard } from "./EbayAuditPicker";

// Dev-only smoke test for auditing eBay sync data. No auth (public market
// comps), but noindex so it never lands in search results.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "eBay Sync Audit · OWL Dev",
  robots: { index: false, follow: false },
};

type JoinedRelation<T> = T | T[] | null;
function firstRelation<T>(rel: JoinedRelation<T>): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

interface SetRel {
  code: string | null;
  name: string | null;
  series?: string | null;
  year?: number | null;
}

interface PickerCardRow {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  sets: JoinedRelation<{ code: string | null }>;
}

interface CardDetail {
  id: string;
  card_image_id: string | null;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  sets: JoinedRelation<SetRel>;
}

interface SaleRow {
  ebay_item_id: string;
  sold_at: string | null;
  sale_price: number | null;
  currency: string | null;
  grader: string | null;
  grade: number | null;
  condition: string | null;
  sale_type: string | null;
  title: string | null;
  ebay_url: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

function fmtPrice(v: number | null, currency: string | null): string {
  if (v === null || v === undefined) return "—";
  const suffix = currency && currency !== "USD" ? ` ${currency}` : "";
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${suffix}`;
}

function fmtGrade(grader: string | null, grade: number | null): string {
  const parts = [grader, grade].filter(
    (x) => x !== null && x !== undefined && x !== ""
  );
  return parts.length > 0 ? parts.join(" ") : "—";
}

export default async function EbayAuditPage(
  props: {
    searchParams: Promise<{ card?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = createServiceClient();
  const rawCard = searchParams.card;
  const selectedId = Array.isArray(rawCard) ? rawCard[0] : rawCard;

  // Q1: distinct card_ids present in ebay_sales (cap at 5000 — plenty for a
  // dev tool; noted so a silent truncation isn't mistaken for full coverage).
  const { data: saleCardRows, error: saleCardErr } = await supabase
    .from("ebay_sales")
    .select("card_id")
    .not("card_id", "is", null)
    .limit(5000);

  const cardIds = Array.from(
    new Set(
      ((saleCardRows ?? []) as { card_id: string | null }[])
        .map((r) => r.card_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  // Q1b: card info for the picker.
  let pickerCards: PickerCard[] = [];
  if (cardIds.length > 0) {
    const { data: cardRows } = await supabase
      .from("cards")
      .select("id, name, card_number, rarity, sets!cards_set_game_fk ( code )")
      .in("id", cardIds)
      .order("name");
    pickerCards = ((cardRows ?? []) as PickerCardRow[]).map((c) => ({
      id: c.id,
      name: c.name,
      card_number: c.card_number,
      rarity: c.rarity,
      setCode: firstRelation(c.sets)?.code ?? null,
    }));
  }

  // Q2 + Q3: selected card detail and its sold comps.
  let card: CardDetail | null = null;
  let sales: SaleRow[] = [];
  let selectionMissing = false;

  if (selectedId) {
    const { data: cardRow } = await supabase
      .from("cards")
      .select(
        "id, card_image_id, name, card_number, rarity, image_url, image_url_small, image_url_preview, sets!cards_set_game_fk ( code, name, series, year )"
      )
      .eq("id", selectedId)
      .maybeSingle();
    card = (cardRow as CardDetail | null) ?? null;
    selectionMissing = !card;

    if (card) {
      const { data: saleRows } = await supabase
        .from("ebay_sales")
        .select(
          "ebay_item_id, sold_at, sale_price, currency, grader, grade, condition, sale_type, title, ebay_url"
        )
        .eq("card_id", selectedId)
        .order("sold_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(50);
      sales = (saleRows ?? []) as SaleRow[];
    }
  }

  const set = card ? firstRelation(card.sets) : null;
  const img = card
    ? card.image_url_small ?? card.image_url ?? card.image_url_preview
    : null;

  return (
    <div className="min-h-screen bg-void font-mono text-text">
      <div className="mx-auto max-w-[1240px] px-4 py-8">
        <header className="mb-6 border-b border-border pb-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-owl">
            OWL · Dev
          </p>
          <h1 className="text-2xl font-bold text-text">eBay Sync Audit</h1>
          <p className="mt-1 text-sm text-text-2">
            {pickerCards.length} card{pickerCards.length === 1 ? "" : "s"} with rows in{" "}
            <code className="text-text">ebay_sales</code>. Select one to inspect its sold comps.
          </p>
        </header>

        {saleCardErr ? (
          <p className="rounded border border-border bg-surface px-4 py-3 text-sm text-loss">
            Failed to read ebay_sales: {saleCardErr.message}
          </p>
        ) : pickerCards.length === 0 ? (
          <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
            No cards have rows in <code className="text-text">ebay_sales</code> yet. Run the sync
            first: <code className="text-text">/api/sync/ebay?cursor=1</code>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            <aside>
              <EbayAuditPicker cards={pickerCards} selectedId={selectedId} />
            </aside>

            <section>
              {!selectedId ? (
                <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
                  ← pick a card to see its eBay sold comps.
                </p>
              ) : selectionMissing ? (
                <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-loss">
                  Card <code className="text-text">{selectedId}</code> not found.
                </p>
              ) : (
                <>
                  <div className="mb-6 flex gap-4 rounded border border-border bg-surface p-4">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      (<img
                        src={img}
                        alt={card?.name ?? "card"}
                        className="h-40 w-auto rounded border border-border object-contain"
                      />)
                    ) : (
                      <div className="flex h-40 w-28 items-center justify-center rounded border border-border text-xs text-text-3">
                        no image
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-bold text-text">
                        {card?.name ?? "(unnamed)"}
                      </h2>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                        <dt className="text-text-3">number</dt>
                        <dd className="text-text">{card?.card_number ?? "—"}</dd>
                        <dt className="text-text-3">rarity</dt>
                        <dd className="text-text">{card?.rarity ?? "—"}</dd>
                        <dt className="text-text-3">set</dt>
                        <dd className="text-text">
                          {[set?.code, set?.name].filter(Boolean).join(" · ") || "—"}
                        </dd>
                      </dl>
                    </div>
                  </div>

                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-owl">
                      Sold comps
                    </h3>
                    <span className="text-xs text-text-2">
                      {sales.length} row{sales.length === 1 ? "" : "s"}
                      {sales.length === 50 ? " (capped)" : ""}
                    </span>
                  </div>

                  {sales.length === 0 ? (
                    <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
                      No ebay_sales rows for this card.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded border border-border">
                      <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-surf2 text-left text-xs uppercase tracking-wider text-text-2">
                            <th className="px-3 py-2 font-semibold">sold</th>
                            <th className="px-3 py-2 text-right font-semibold">price</th>
                            <th className="px-3 py-2 font-semibold">grade</th>
                            <th className="px-3 py-2 font-semibold">condition</th>
                            <th className="px-3 py-2 font-semibold">title</th>
                            <th className="px-3 py-2 font-semibold">link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.map((s) => (
                            <tr
                              key={s.ebay_item_id}
                              className="border-t border-border hover:bg-surf2"
                            >
                              <td className="whitespace-nowrap px-3 py-2 text-text-2">
                                {fmtDate(s.sold_at)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right text-text">
                                {fmtPrice(s.sale_price, s.currency)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-text">
                                {fmtGrade(s.grader, s.grade)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-text-2">
                                {s.condition ?? "—"}
                              </td>
                              <td
                                className="max-w-[380px] truncate px-3 py-2 text-text-2"
                                title={s.title ?? undefined}
                              >
                                {s.title ?? "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {s.ebay_url ? (
                                  <a
                                    href={s.ebay_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-owl hover:underline"
                                  >
                                    view ↗
                                  </a>
                                ) : (
                                  <span className="text-text-3">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
