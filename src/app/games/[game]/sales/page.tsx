import Link from "next/link";
import { redirect } from "next/navigation";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import { publicGameStaticParams } from "@/lib/static-game-params";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import "../riftbound-pages.css";

export const revalidate = 900;

export function generateStaticParams() {
  return publicGameStaticParams();
}

type SaleRow = {
  id: string;
  card_id: string | null;
  ebay_item_id: string;
  sale_price: number | string | null;
  currency: string | null;
  grader: string | null;
  grade: number | string | null;
  sale_type: string | null;
  condition: string | null;
  title: string | null;
  ebay_url: string | null;
  sold_at: string | null;
};

type CardRow = { id: string; name: string; card_number: string | null; sets: { code: string | null } | Array<{ code: string | null }> | null };

function money(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function dateLabel(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function RiftboundSalesPage(props: { params: Promise<{ game: string }> }) {
  const { game: gameRouteSlug } = await props.params;
  const supabase = createCachedServiceClient(900);
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: false,
    publicOnly: publicOnlyForCatalogPreview(),
  });
  if (gameResult.error) {
    return <main className="rb-page"><div className="rb-empty"><h2>eBay sales unavailable</h2><p>{gameResult.error.message}</p></div></main>;
  }
  if (gameResult.game.slug !== "riftbound") redirect(gamePath(gameRouteSlug, "/catalog"));

  const salesResult = await supabase
    .from("ebay_sales")
    .select("id, card_id, ebay_item_id, sale_price, currency, grader, grade, sale_type, condition, title, ebay_url, sold_at", { count: "exact" })
    .eq("game_id", gameResult.game.id)
    .order("sold_at", { ascending: false })
    .limit(50);
  const sales = (salesResult.data ?? []) as SaleRow[];
  const cardIds = [...new Set(sales.map((sale) => sale.card_id).filter((id): id is string => Boolean(id)))];
  const cardsResult = cardIds.length
    ? await supabase.from("cards").select("id, name, card_number, sets!cards_set_game_fk(code)").eq("game_id", gameResult.game.id).in("id", cardIds)
    : { data: [], error: null };
  const cards = (cardsResult.data ?? []) as CardRow[];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const prices = sales.map((sale) => Number(sale.sale_price)).filter((price) => Number.isFinite(price) && price > 0);
  const average = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
  const topSale = prices.length ? Math.max(...prices) : 0;
  const graded = sales.filter((sale) => sale.grader || sale.grade).length;
  const error = salesResult.error?.message ?? cardsResult.error?.message ?? null;

  return (
    <main className="rb-page">
      <div className="rb-breadcrumb"><Link href={gamePath(gameRouteSlug, "/markets")}>Riftbound</Link> / eBay Sales</div>
      <header className="rb-hero">
        <div className="rb-kicker">Verified sold listings</div>
        <h1 className="rb-title">What Riftbound cards actually sold for.</h1>
        <p className="rb-subtitle">Completed sales give collectors a second market signal alongside listing prices. Raw, graded, and treatment-specific results remain separated.</p>
      </header>

      <section className="rb-stat-grid" aria-label="eBay sales summary">
        <div className="rb-stat"><span className="rb-stat-label">Sales tracked</span><strong className="rb-stat-value">{(salesResult.count ?? sales.length).toLocaleString()}</strong><span className="rb-stat-note">Riftbound-only records</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Recent average</span><strong className="rb-stat-value">{average ? money(average) : "Pending"}</strong><span className="rb-stat-note">latest {prices.length} priced sales</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Top recent sale</span><strong className="rb-stat-value">{topSale ? money(topSale) : "Pending"}</strong><span className="rb-stat-note">within this feed</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Graded sales</span><strong className="rb-stat-value">{graded}</strong><span className="rb-stat-note">latest 50 records</span></div>
      </section>

      {error ? <div className="rb-empty"><h2>Sales data could not be loaded</h2><p>{error}</p></div> : sales.length ? (
        <section className="rb-section">
          <div className="rb-section-head"><div><h2 className="rb-section-title">Latest completed sales</h2><p className="rb-section-copy">Card matches stay scoped to Riftbound.</p></div></div>
          <div className="rb-sale-list">
            {sales.map((sale) => {
              const card = sale.card_id ? cardById.get(sale.card_id) : null;
              const set = card ? (Array.isArray(card.sets) ? card.sets[0] : card.sets) : null;
              const price = Number(sale.sale_price);
              const grade = [sale.grader, sale.grade].filter(Boolean).join(" ");
              return <article className="rb-sale-row" key={sale.id}>
                <div><div className="rb-sale-name">{card?.name ?? sale.title ?? "Unmatched Riftbound sale"}</div><div className="rb-meta">{[set?.code, card?.card_number, sale.condition].filter(Boolean).join(" · ") || sale.ebay_item_id}</div></div>
                <div className="rb-meta">{grade || sale.sale_type || "Raw"}</div>
                <div className="rb-meta">{dateLabel(sale.sold_at)}</div>
                <div>{Number.isFinite(price) ? <div className="rb-sale-price">{money(price, sale.currency ?? "USD")}</div> : null}{sale.ebay_url && <a className="rb-sale-link" href={sale.ebay_url} target="_blank" rel="noreferrer">View listing ↗</a>}</div>
              </article>;
            })}
          </div>
        </section>
      ) : (
        <div className="rb-empty">
          <h2>Riftbound sold comps are next</h2>
          <p>The card catalog is ready, but no Riftbound eBay sales have been verified yet. This page will populate automatically once the sales matcher is enabled for this game.</p>
          <Link href={gamePath(gameRouteSlug, "/catalog")}>Browse all Riftbound cards →</Link>
        </div>
      )}
    </main>
  );
}
