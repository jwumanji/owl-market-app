import Link from "next/link";
import { createServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import {
  publicOnlyForCatalogPreview,
  resolveGameScope,
  type GameScope,
} from "@/lib/game-scope";
import {
  catalogCardCost,
  catalogCardDomains,
  catalogCardType,
} from "@/lib/catalog-card-fields";
import { catalogPageDescription } from "@/lib/game-catalog-copy";
import "./catalog.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type CatalogSearchParams = {
  set?: string;
  rarity?: string;
  variant?: string;
  q?: string;
  page?: string;
};

type SetRow = {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  card_count: number | null;
};

type TaxonomyRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type CardRow = {
  id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  rarity: string | null;
  variant_label: string | null;
  variant_id: string | null;
  rarity_id: string | null;
  card_type: string | null;
  color: string[] | string | null;
  cost: number | string | null;
  types: string[] | string | null;
  game_payload: Record<string, unknown> | null;
  sets: { slug: string | null; code: string | null; name: string | null } | Array<{ slug: string | null; code: string | null; name: string | null }> | null;
};

type CatalogData =
  | {
      ok: true;
      game: GameScope;
      sets: SetRow[];
      rarities: TaxonomyRow[];
      variants: TaxonomyRow[];
      cards: CardRow[];
      totalCards: number;
      pageIndex: number;
      selectedSet: SetRow | null;
      selectedRarity: TaxonomyRow | null;
      selectedVariant: TaxonomyRow | null;
      query: string;
      warning: string | null;
    }
  | {
      ok: false;
      gameName: string;
      message: string;
    };

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function cleanSearch(value: string | undefined) {
  return (value ?? "").replace(/[,%()]/g, " ").trim().slice(0, 80);
}

function pageIndex(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
}

function joinedSet(row: CardRow) {
  if (Array.isArray(row.sets)) return row.sets[0] ?? null;
  return row.sets;
}

function hrefFor(gameRouteSlug: string, params: CatalogSearchParams) {
  const query = new URLSearchParams();
  if (params.set) query.set("set", params.set);
  if (params.rarity) query.set("rarity", params.rarity);
  if (params.variant) query.set("variant", params.variant);
  if (params.q) query.set("q", params.q);
  if (params.page && params.page !== "1") query.set("page", params.page);
  const suffix = query.toString();
  return `${gamePath(gameRouteSlug, "/catalog")}${suffix ? `?${suffix}` : ""}`;
}

async function loadCatalog(gameRouteSlug: string, searchParams: CatalogSearchParams): Promise<CatalogData> {
  try {
    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
      defaultToOnePiece: false,
      publicOnly: publicOnlyForCatalogPreview(),
    });

    if (gameResult.error) {
      return { ok: false, gameName: gameRouteSlug, message: gameResult.error.message };
    }

    const game = gameResult.game;
    const [setsRes, raritiesRes, variantsRes] = await Promise.all([
      supabase
        .from("sets")
        .select("id, slug, code, name, card_count")
        .eq("game_id", game.id)
        .order("code"),
      supabase
        .from("game_rarities")
        .select("id, code, name, sort_order")
        .eq("game_id", game.id)
        .order("sort_order"),
      supabase
        .from("game_variants")
        .select("id, code, name, sort_order")
        .eq("game_id", game.id)
        .order("sort_order"),
    ]);

    if (setsRes.error) return { ok: false, gameName: game.name, message: setsRes.error.message };

    const sets = (setsRes.data ?? []) as SetRow[];
    const rarities = (raritiesRes.data ?? []) as TaxonomyRow[];
    const variants = (variantsRes.data ?? []) as TaxonomyRow[];
    const selectedSet = sets.find((set) => set.slug === searchParams.set || set.code === searchParams.set) ?? null;
    const selectedRarity = rarities.find((rarity) => rarity.code === searchParams.rarity) ?? null;
    const selectedVariant = variants.find((variant) => variant.code === searchParams.variant) ?? null;
    const query = cleanSearch(searchParams.q);
    const currentPage = pageIndex(searchParams.page);
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let cardsQuery = supabase
      .from("cards")
      .select(`
        id,
        card_image_id,
        card_number,
        name,
        rarity,
        variant_label,
        variant_id,
        rarity_id,
        card_type,
        color,
        cost,
        types,
        game_payload,
        sets (slug, code, name)
      `, { count: "exact" })
      .eq("game_id", game.id);

    if (selectedSet) cardsQuery = cardsQuery.eq("set_id", selectedSet.id);
    if (selectedRarity?.id) cardsQuery = cardsQuery.eq("rarity_id", selectedRarity.id);
    if (selectedVariant?.id) cardsQuery = cardsQuery.eq("variant_id", selectedVariant.id);
    if (query) cardsQuery = cardsQuery.or(`name.ilike.%${query}%,card_number.ilike.%${query}%`);

    const cardsRes = await cardsQuery
      .order("card_number", { ascending: true })
      .range(from, to);

    if (cardsRes.error) return { ok: false, gameName: game.name, message: cardsRes.error.message };

    const warnings = [
      raritiesRes.error ? `rarities: ${raritiesRes.error.message}` : null,
      variantsRes.error ? `variants: ${variantsRes.error.message}` : null,
    ].filter(Boolean);

    return {
      ok: true,
      game,
      sets,
      rarities,
      variants,
      cards: (cardsRes.data ?? []) as unknown as CardRow[],
      totalCards: cardsRes.count ?? 0,
      pageIndex: currentPage,
      selectedSet,
      selectedRarity,
      selectedVariant,
      query,
      warning: warnings.length > 0 ? warnings.join(" / ") : null,
    };
  } catch (error) {
    return {
      ok: false,
      gameName: gameRouteSlug,
      message: error instanceof Error ? error.message : "Unable to load catalog.",
    };
  }
}

export async function generateMetadata({ params }: { params: { game: string } }) {
  return {
    title: `${params.game.replace(/-/g, " ")} cards - OWL Market`,
  };
}

export default async function GameCatalogPage({
  params,
  searchParams,
}: {
  params: { game: string };
  searchParams: CatalogSearchParams;
}) {
  const data = await loadCatalog(params.game, searchParams);

  if (!data.ok) {
    return (
      <section className="catalog-page">
        <div className="catalog-error">
          <div className="catalog-kicker">Card catalog</div>
          <h1>{data.gameName}</h1>
          <p>{data.message}</p>
        </div>
      </section>
    );
  }

  const pageNumber = data.pageIndex + 1;
  const lastPage = Math.max(1, Math.ceil(data.totalCards / PAGE_SIZE));
  const hasPrevious = data.pageIndex > 0;
  const hasNext = pageNumber < lastPage;
  const activeParams = {
    set: data.selectedSet?.slug,
    rarity: data.selectedRarity?.code ?? undefined,
    variant: data.selectedVariant?.code ?? undefined,
    q: data.query || undefined,
  };

  return (
    <section className="catalog-page">
      <div className="catalog-breadcrumb">
        <Link href={gamePath(data.game.routeSlug)}>{data.game.name}</Link>
        <span>›</span>
        <span>Cards</span>
      </div>

      <header className="catalog-hero">
        <div>
          <div className="catalog-kicker">Catalog cards</div>
          <h1>{data.game.name}</h1>
          <p>{catalogPageDescription(data.game)}</p>
        </div>
        <div className="catalog-count">
          <span>{formatNumber(data.totalCards)}</span>
          cards
        </div>
      </header>

      <div className="catalog-toolbar">
        <form action={gamePath(data.game.routeSlug, "/catalog")} className="catalog-search">
          {data.selectedSet && <input type="hidden" name="set" value={data.selectedSet.slug} />}
          {data.selectedRarity?.code && <input type="hidden" name="rarity" value={data.selectedRarity.code} />}
          {data.selectedVariant?.code && <input type="hidden" name="variant" value={data.selectedVariant.code} />}
          <input type="search" name="q" defaultValue={data.query} placeholder="Search card name or number" />
          <button type="submit">Search</button>
        </form>
        <Link href={gamePath(data.game.routeSlug, "/catalog")} className="catalog-clear">
          Clear filters
        </Link>
      </div>

      <div className="catalog-filter-row">
        <FilterGroup
          title="Sets"
          items={data.sets.map((set) => ({
            key: set.slug,
            label: set.code ?? set.slug,
            href: hrefFor(data.game.routeSlug, { ...activeParams, set: set.slug, page: "1" }),
            active: data.selectedSet?.id === set.id,
          }))}
        />
        <FilterGroup
          title="Rarities"
          items={data.rarities.map((rarity) => ({
            key: rarity.code ?? rarity.id,
            label: rarity.name ?? rarity.code ?? "Unknown",
            href: hrefFor(data.game.routeSlug, { ...activeParams, rarity: rarity.code ?? undefined, page: "1" }),
            active: data.selectedRarity?.id === rarity.id,
          }))}
        />
        <FilterGroup
          title="Variants"
          items={data.variants.map((variant) => ({
            key: variant.code ?? variant.id,
            label: variant.name ?? variant.code ?? "Unknown",
            href: hrefFor(data.game.routeSlug, { ...activeParams, variant: variant.code ?? undefined, page: "1" }),
            active: data.selectedVariant?.id === variant.id,
          }))}
        />
      </div>

      {data.warning && <div className="catalog-warning">{data.warning}</div>}

      <div className="catalog-table-wrap">
        <div className="catalog-table-head">
          <span>Card</span>
          <span>Set</span>
          <span>Rarity</span>
          <span>Variant</span>
          <span>Cost</span>
          <span>Type</span>
          <span>Domain</span>
        </div>
        {data.cards.length === 0 ? (
          <div className="catalog-empty">No cards match these filters.</div>
        ) : (
          data.cards.map((card) => {
            const set = joinedSet(card);
            return (
              <Link className="catalog-row" key={card.id} href={gamePath(data.game.routeSlug, `/catalog/${card.id}`)}>
                <span className="catalog-card-name">
                  <b>{card.card_number ?? card.card_image_id ?? "No number"}</b>
                  {card.name}
                </span>
                <span>{set?.code ?? "No set"}</span>
                <span>{card.rarity ?? "Unknown"}</span>
                <span>{card.variant_label ?? "Base"}</span>
                <span>{catalogCardCost(card)}</span>
                <span>{catalogCardType(card)}</span>
                <span>{catalogCardDomains(card) ?? "—"}</span>
              </Link>
            );
          })
        )}
      </div>

      <div className="catalog-pagination">
        <Link
          aria-disabled={!hasPrevious}
          className={!hasPrevious ? "disabled" : ""}
          href={hasPrevious ? hrefFor(data.game.routeSlug, { ...activeParams, page: String(pageNumber - 1) }) : "#"}
        >
          Previous
        </Link>
        <span>
          Page {pageNumber} of {lastPage}
        </span>
        <Link
          aria-disabled={!hasNext}
          className={!hasNext ? "disabled" : ""}
          href={hasNext ? hrefFor(data.game.routeSlug, { ...activeParams, page: String(pageNumber + 1) }) : "#"}
        >
          Next
        </Link>
      </div>
    </section>
  );
}

function FilterGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <div className="catalog-filter-group">
      <div className="catalog-filter-title">{title}</div>
      <div>
        {items.map((item) => (
          <Link key={item.key} href={item.href} className={item.active ? "active" : ""}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
