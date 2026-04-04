import { createServiceClient } from "@/lib/supabase-server";
import { CardRow, SetInfo } from "@/lib/types";
import MarketTable from "@/components/market/MarketTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top 200 One Piece TCG cards ranked by market value.",
};

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: { set?: string };
}) {
  const supabase = createServiceClient();
  const selectedSetId = searchParams.set ?? "all";

  // Build the cards query — when a set is selected, fetch ALL priced cards for it
  let cardsQuery = supabase
    .from("cards")
    .select(`
      id,
      card_image_id,
      card_number,
      name,
      name_base,
      variant_label,
      rarity,
      card_type,
      color,
      image_url,
      image_url_small,
      price_stats (
        market_avg,
        tcg_market,
        ebay_avg,
        chg_1d,
        chg_7d,
        chg_30d
      ),
      sets (
        id,
        slug,
        code,
        name,
        series,
        color,
        year
      )
    `)
    .not("price_stats", "is", null)
    .order("market_avg", { referencedTable: "price_stats", ascending: false });

  if (selectedSetId !== "all") {
    cardsQuery = cardsQuery.eq("set_id", selectedSetId);
  } else {
    cardsQuery = cardsQuery.limit(200);
  }

  const [cardsRes, setsRes] = await Promise.all([
    cardsQuery,

    supabase
      .from("sets")
      .select("id, slug, code, name, series, color, year")
      .order("name"),
  ]);

  // Fallback JS sort in case referencedTable ordering doesn't work
  const cards = ((cardsRes.data as CardRow[] | null) ?? []).sort(
    (a, b) => (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
  );

  // Sort sets: OP01-14, then EB01-03, then PRB01-02, then everything else
  const PREFIX_ORDER: Record<string, number> = { OP: 0, EB: 1, PRB: 2 };
  const sets = ((setsRes.data as SetInfo[] | null) ?? []).sort((a, b) => {
    const parseCode = (code: string | null) => {
      const m = code?.match(/^([A-Z]+)(\d+)/);
      if (!m) return { prefix: "ZZZ", num: 999 };
      return { prefix: m[1], num: parseInt(m[2], 10) };
    };
    const pa = parseCode(a.code);
    const pb = parseCode(b.code);
    const oa = PREFIX_ORDER[pa.prefix] ?? 99;
    const ob = PREFIX_ORDER[pb.prefix] ?? 99;
    if (oa !== ob) return oa - ob;
    return pa.num - pb.num;
  });

  const selectedSetName =
    selectedSetId !== "all"
      ? sets.find((s) => s.id === selectedSetId)?.name
      : null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1 tracking-tight">Markets</h1>
      <p className="text-text-2 text-sm mb-6">
        {selectedSetName
          ? `All priced cards in ${selectedSetName}`
          : "Top 200 cards by market value"}
      </p>
      <MarketTable cards={cards} sets={sets} initialSet={selectedSetId} />
    </section>
  );
}
