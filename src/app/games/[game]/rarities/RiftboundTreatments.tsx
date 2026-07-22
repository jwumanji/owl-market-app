import Link from "next/link";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";

type VariantRow = { id: string; code: string | null; name: string | null; sort_order: number | null };
type CardRow = { id: string; variant_id: string | null };
type PriceRow = { card_id: string; tcg_market: number | string | null; market_avg: number | string | null };

const TREATMENT_COPY: Record<string, string> = {
  BASE: "The standard printing and baseline for comparing every chase treatment.",
  ALTERNATE_ART: "Alternate artwork that changes the presentation while preserving the card identity.",
  OVERNUMBERED: "Collector-numbered chase cards printed beyond the main set range.",
  SIGNATURE: "Champion signature treatments built for premium collector appeal.",
  METAL: "Special metal printings kept distinct from standard cardboard variants.",
};

function finitePrice(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export async function RiftboundTreatments({ gameRouteSlug }: { gameRouteSlug: string }) {
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: false,
    publicOnly: publicOnlyForCatalogPreview(),
  });
  if (gameResult.error || gameResult.game.slug !== "riftbound") return null;

  const variantsResult = await supabase.from("game_variants").select("id, code, name, sort_order").eq("game_id", gameResult.game.id).order("sort_order");
  const cards: CardRow[] = [];
  const prices: PriceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await supabase.from("cards").select("id, variant_id").eq("game_id", gameResult.game.id).eq("region", "en").range(from, from + 999);
    if (result.error) break;
    const page = (result.data ?? []) as CardRow[];
    cards.push(...page);
    if (page.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const result = await supabase.from("price_stats").select("card_id, tcg_market, market_avg").eq("game_id", gameResult.game.id).range(from, from + 999);
    if (result.error) break;
    const page = (result.data ?? []) as PriceRow[];
    prices.push(...page);
    if (page.length < 1000) break;
  }

  const priceByCard = new Map(prices.map((row) => [row.card_id, finitePrice(row.tcg_market) ?? finitePrice(row.market_avg)]));
  const variants = (variantsResult.data ?? []) as VariantRow[];

  return (
    <section className="rb-page rb-section" aria-labelledby="riftbound-treatments" style={{ paddingTop: 0 }}>
      <div className="rb-section-head">
        <div>
          <div className="rb-kicker">Collector finishes</div>
          <h2 className="rb-section-title" id="riftbound-treatments">Treatments</h2>
          <p className="rb-section-copy">Treatment is how a card is printed. It stays separate from rarity so collector values remain understandable.</p>
        </div>
      </div>
      <div className="rb-treatment-grid">
        {variants.map((variant) => {
          const variantCards = cards.filter((card) => card.variant_id === variant.id);
          const priced = variantCards.map((card) => priceByCard.get(card.id)).filter((price): price is number => price != null);
          const total = priced.reduce((sum, price) => sum + price, 0);
          const code = variant.code ?? "";
          return <article className="rb-card" key={variant.id}>
            <span className={`rb-status${priced.length ? "" : " is-pending"}`}>{priced.length ? "Pricing active" : "Pricing pending"}</span>
            <h3 className="rb-card-title" style={{ marginTop: 14 }}>{variant.name ?? code.replace(/_/g, " ")}</h3>
            <p className="rb-card-copy">{TREATMENT_COPY[code] ?? "A distinct Riftbound collector printing."}</p>
            <div className="rb-metrics" style={{ marginTop: 15 }}>
              <div className="rb-metric"><strong>{variantCards.length}</strong><span>Cards</span></div>
              <div className="rb-metric"><strong>{priced.length}</strong><span>Priced</span></div>
              <div className="rb-metric"><strong>{priced.length ? money(total) : "—"}</strong><span>Total</span></div>
            </div>
            <div className="rb-value"><Link href={`${gamePath(gameRouteSlug, "/catalog")}?variant=${encodeURIComponent(code)}`}>View treatment cards →</Link></div>
          </article>;
        })}
      </div>
    </section>
  );
}
