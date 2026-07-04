import { createServiceClient } from "@/lib/supabase-server";
import JpAuditPicker, { type PickerCard } from "./JpAuditPicker";

// Dev-only smoke test for auditing Japanese (Yuyu-tei) price sync data. No auth
// (public market data); noindex is inherited from src/app/dev/layout.tsx.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "JP Price Audit · OWL Dev",
};

type JoinedRelation<T> = T | T[] | null;
function firstRelation<T>(rel: JoinedRelation<T>): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

interface SetRel {
  code: string | null;
  name: string | null;
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

interface JpPriceRow {
  source_card_id: string;
  snapshot_date: string | null;
  price_jpy: number | null;
  variant: string | null;
  rarity: string | null;
  card_name: string | null;
  in_stock: boolean | null;
  match_method: string | null;
  source_url: string | null;
}

function fmtYen(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `¥${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function JpAuditPage({
  searchParams,
}: {
  searchParams: { card?: string | string[] };
}) {
  const supabase = createServiceClient();
  const rawCard = searchParams.card;
  const selectedId = Array.isArray(rawCard) ? rawCard[0] : rawCard;

  // Q1: distinct matched card_ids present in jp_prices (cap 5000).
  const { data: priceCardRows, error: priceErr } = await supabase
    .from("jp_prices")
    .select("card_id")
    .not("card_id", "is", null)
    .limit(5000);

  const missingTable = Boolean(priceErr && (priceErr.code === "42P01" || priceErr.message?.includes("jp_prices")));

  const cardIds = Array.from(
    new Set(
      ((priceCardRows ?? []) as { card_id: string | null }[])
        .map((r) => r.card_id)
        .filter((id): id is string => Boolean(id))
    )
  );

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

  let card: CardDetail | null = null;
  let prices: JpPriceRow[] = [];
  let selectionMissing = false;

  if (selectedId && !missingTable) {
    const { data: cardRow } = await supabase
      .from("cards")
      .select(
        "id, card_image_id, name, card_number, rarity, image_url, image_url_small, image_url_preview, sets!cards_set_game_fk ( code, name )"
      )
      .eq("id", selectedId)
      .maybeSingle();
    card = (cardRow as CardDetail | null) ?? null;
    selectionMissing = !card;

    if (card) {
      const { data: priceRows } = await supabase
        .from("jp_prices")
        .select("source_card_id, snapshot_date, price_jpy, variant, rarity, card_name, in_stock, match_method, source_url")
        .eq("card_id", selectedId)
        .order("snapshot_date", { ascending: false })
        .order("price_jpy", { ascending: false, nullsFirst: false })
        .limit(50);
      prices = (priceRows ?? []) as JpPriceRow[];
    }
  }

  const set = card ? firstRelation(card.sets) : null;
  const img = card ? card.image_url_small ?? card.image_url ?? card.image_url_preview : null;

  return (
    <div className="min-h-screen bg-void font-mono text-text">
      <div className="mx-auto max-w-[1240px] px-4 py-8">
        <header className="mb-6 border-b border-border pb-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-owl">OWL · Dev</p>
          <h1 className="text-2xl font-bold text-text">JP Price Audit</h1>
          <p className="mt-1 text-sm text-text-2">
            Yuyu-tei (遊々亭) prices synced into <code className="text-text">jp_prices</code>. Select a card to inspect.
          </p>
        </header>

        {missingTable ? (
          <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-loss">
            <code className="text-text">jp_prices</code> table not found. Apply{" "}
            <code className="text-text">schema-migration-v44-jp-prices.sql</code> in Supabase, then run{" "}
            <code className="text-text">/api/sync/jp-prices?cursor=1</code>.
          </p>
        ) : pickerCards.length === 0 ? (
          <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
            No cards have matched rows in <code className="text-text">jp_prices</code> yet. Run the sync:{" "}
            <code className="text-text">/api/sync/jp-prices?cursor=1</code>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            <aside>
              <JpAuditPicker cards={pickerCards} selectedId={selectedId} />
            </aside>

            <section>
              {!selectedId ? (
                <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
                  ← pick a card to see its Yuyu-tei prices.
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
                      <img
                        src={img}
                        alt={card?.name ?? "card"}
                        className="h-40 w-auto rounded border border-border object-contain"
                      />
                    ) : (
                      <div className="flex h-40 w-28 items-center justify-center rounded border border-border text-xs text-text-3">
                        no image
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-bold text-text">{card?.name ?? "(unnamed)"}</h2>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                        <dt className="text-text-3">number</dt>
                        <dd className="text-text">{card?.card_number ?? "—"}</dd>
                        <dt className="text-text-3">rarity</dt>
                        <dd className="text-text">{card?.rarity ?? "—"}</dd>
                        <dt className="text-text-3">set</dt>
                        <dd className="text-text">{[set?.code, set?.name].filter(Boolean).join(" · ") || "—"}</dd>
                      </dl>
                    </div>
                  </div>

                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-owl">Yuyu-tei prices</h3>
                    <span className="text-xs text-text-2">
                      {prices.length} row{prices.length === 1 ? "" : "s"}
                      {prices.length === 50 ? " (capped)" : ""}
                    </span>
                  </div>

                  {prices.length === 0 ? (
                    <p className="rounded border border-border bg-surface px-4 py-6 text-sm text-text-2">
                      No jp_prices rows for this card.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded border border-border">
                      <table className="w-full min-w-[680px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-surf2 text-left text-xs uppercase tracking-wider text-text-2">
                            <th className="px-3 py-2 font-semibold">snapshot</th>
                            <th className="px-3 py-2 text-right font-semibold">price (JPY)</th>
                            <th className="px-3 py-2 font-semibold">variant</th>
                            <th className="px-3 py-2 font-semibold">rarity</th>
                            <th className="px-3 py-2 font-semibold">stock</th>
                            <th className="px-3 py-2 font-semibold">name / link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.map((p) => (
                            <tr key={`${p.source_card_id}-${p.snapshot_date}`} className="border-t border-border hover:bg-surf2">
                              <td className="whitespace-nowrap px-3 py-2 text-text-2">{p.snapshot_date ?? "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right text-text">{fmtYen(p.price_jpy)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-text">{p.variant || "base"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-text-2">{p.rarity ?? "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-text-2">{p.in_stock ? "✓" : "✗"}</td>
                              <td className="max-w-[320px] truncate px-3 py-2 text-text-2">
                                {p.source_url ? (
                                  <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-owl hover:underline">
                                    {p.card_name || "view"} ↗
                                  </a>
                                ) : (
                                  p.card_name || "—"
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
