import Link from "next/link";
import { createServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import {
  publicOnlyForCatalogPreview,
  resolveGameScope,
  type GameScope,
} from "@/lib/game-scope";
import {
  catalogCardDomains,
  catalogCardType,
} from "@/lib/catalog-card-fields";
import "./game-overview.css";

export const dynamic = "force-dynamic";

type TaxonomyRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type SetRow = {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  year: number | null;
  color: string | null;
  card_count: number | null;
  set_type_id: string | null;
};

type CardSampleRow = {
  id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  rarity: string | null;
  variant_label: string | null;
  card_type: string | null;
  color: string[] | string | null;
  cost: number | string | null;
  types: string[] | string | null;
  game_payload: Record<string, unknown> | null;
  sets: { slug: string | null; code: string | null; name: string | null } | Array<{ slug: string | null; code: string | null; name: string | null }> | null;
};

type SourceRecordRow = {
  record_type: string | null;
  fetched_at: string | null;
};

type PriceProviderRow = {
  provider: string | null;
  source_game_slug: string | null;
  is_active: boolean | null;
  pricing_capabilities: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

type OverviewData =
  | {
      ok: true;
      game: GameScope;
      sets: SetRow[];
      rarities: TaxonomyRow[];
      variants: TaxonomyRow[];
      setTypes: TaxonomyRow[];
      sourceRecords: SourceRecordRow[];
      cardCount: number;
      sampleCards: CardSampleRow[];
      providerMappings: PriceProviderRow[];
      warnings: string[];
    }
  | {
      ok: false;
      gameName: string;
      message: string;
    };

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function metadataText(metadata: Record<string, unknown>, key: string, fallback = "Unknown") {
  return asText(metadata[key]) ?? fallback;
}

function joinedSet(row: CardSampleRow) {
  if (Array.isArray(row.sets)) return row.sets[0] ?? null;
  return row.sets;
}

async function loadGameOverview(gameRouteSlug: string): Promise<OverviewData> {
  try {
    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
      defaultToOnePiece: false,
      publicOnly: publicOnlyForCatalogPreview(),
    });

    if (gameResult.error) {
      return {
        ok: false,
        gameName: gameRouteSlug,
        message: gameResult.error.message,
      };
    }

    const game = gameResult.game;
    const [
      setsRes,
      cardCountRes,
      raritiesRes,
      variantsRes,
      setTypesRes,
      sourceRecordsRes,
      sampleCardsRes,
      providerMappingsRes,
    ] = await Promise.all([
      supabase
        .from("sets")
        .select("id, slug, code, name, year, color, card_count, set_type_id")
        .eq("game_id", game.id)
        .order("code"),
      supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("game_id", game.id),
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
      supabase
        .from("game_set_types")
        .select("id, code, name, sort_order")
        .eq("game_id", game.id)
        .order("sort_order"),
      supabase
        .from("tcg_source_records")
        .select("record_type, fetched_at", { count: "exact" })
        .eq("game_id", game.id)
        .limit(5000),
      supabase
        .from("cards")
        .select(`
          id,
          card_image_id,
          card_number,
          name,
          rarity,
          variant_label,
          card_type,
          color,
          cost,
          types,
          game_payload,
          sets (slug, code, name)
        `)
        .eq("game_id", game.id)
        .order("card_number")
        .limit(12),
      supabase
        .from("price_provider_mappings")
        .select("provider, source_game_slug, is_active, pricing_capabilities, metadata")
        .eq("game_id", game.id)
        .order("provider"),
    ]);

    const warnings = [
      setsRes.error ? `sets: ${setsRes.error.message}` : null,
      cardCountRes.error ? `cards count: ${cardCountRes.error.message}` : null,
      raritiesRes.error ? `rarities: ${raritiesRes.error.message}` : null,
      variantsRes.error ? `variants: ${variantsRes.error.message}` : null,
      setTypesRes.error ? `set types: ${setTypesRes.error.message}` : null,
      sourceRecordsRes.error ? `source records: ${sourceRecordsRes.error.message}` : null,
      sampleCardsRes.error ? `sample cards: ${sampleCardsRes.error.message}` : null,
      providerMappingsRes.error ? `provider mappings: ${providerMappingsRes.error.message}` : null,
    ].filter(Boolean) as string[];

    if (setsRes.error) {
      return {
        ok: false,
        gameName: game.name,
        message: setsRes.error.message,
      };
    }

    const sets = (setsRes.data ?? []) as SetRow[];
    const cardCount = cardCountRes.count ?? sets.reduce((sum, set) => sum + (set.card_count ?? 0), 0);

    return {
      ok: true,
      game,
      sets,
      rarities: (raritiesRes.data ?? []) as TaxonomyRow[],
      variants: (variantsRes.data ?? []) as TaxonomyRow[],
      setTypes: (setTypesRes.data ?? []) as TaxonomyRow[],
      sourceRecords: (sourceRecordsRes.data ?? []) as SourceRecordRow[],
      cardCount,
      sampleCards: (sampleCardsRes.data ?? []) as unknown as CardSampleRow[],
      providerMappings: (providerMappingsRes.data ?? []) as PriceProviderRow[],
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      gameName: gameRouteSlug,
      message: error instanceof Error ? error.message : "Unable to load game catalog.",
    };
  }
}

export async function generateMetadata({ params }: { params: { game: string } }) {
  return {
    title: `${params.game.replace(/-/g, " ")} catalog - OWL Market`,
  };
}

export default async function GameOverviewPage({
  params,
}: {
  params: { game: string };
}) {
  const data = await loadGameOverview(params.game);

  if (!data.ok) {
    return (
      <section className="game-overview-page">
        <div className="game-overview-error">
          <div className="game-kicker">Game catalog</div>
          <h1>{data.gameName}</h1>
          <p>{data.message}</p>
        </div>
      </section>
    );
  }

  const { game } = data;
  const metadata = game.metadata;
  const sourceRecordsByType = data.sourceRecords.reduce<Record<string, number>>((acc, record) => {
    const key = record.record_type ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const latestFetch = data.sourceRecords
    .map((record) => record.fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const setTypeById = new Map(data.setTypes.map((type) => [type.id, type]));
  const setTypeCards = data.setTypes.map((type) => {
    const matchingSets = data.sets.filter((set) => set.set_type_id === type.id);
    return {
      ...type,
      setCount: matchingSets.length,
      cardCount: matchingSets.reduce((sum, set) => sum + (set.card_count ?? 0), 0),
    };
  });
  const taxonomyTotal = data.rarities.length + data.variants.length + data.setTypes.length;
  const statusLabel = game.isPublic ? "Public" : "Private preview";
  const pricingStatus = metadataText(metadata, "pricing_status", "unknown");
  const assetStatus = metadataText(metadata, "asset_status", "unknown");

  return (
    <section className="game-overview-page">
      <div className="game-overview-hero">
        <div>
          <div className="game-kicker">Game catalog</div>
          <h1>{game.name}</h1>
          <p>
            Imported catalog view backed by the multi-TCG schema. This page reads game-scoped sets,
            taxonomies, raw source records, and provider mapping status without assuming pricing is live.
          </p>
        </div>
        <div className="game-status-stack" aria-label="Catalog status">
          <span>{statusLabel}</span>
          <span>Pricing: {pricingStatus}</span>
          <span>Assets: {assetStatus}</span>
        </div>
      </div>

      <div className="game-actions">
        <Link href={gamePath(game.routeSlug, "/catalog")}>Open card catalog</Link>
        <Link href={gamePath(game.routeSlug, "/sets")}>Open set index</Link>
        <Link href={gamePath(game.routeSlug, "/rarities")}>Open rarities</Link>
        <Link href={gamePath(game.routeSlug, "/markets")}>Open market status</Link>
        <Link href={gamePath(game.routeSlug, "/characters")}>Open characters</Link>
      </div>

      <div className="game-stat-grid">
        <Metric label="Sets imported" value={formatNumber(data.sets.length)} detail="sets table" />
        <Metric label="Cards imported" value={formatNumber(data.cardCount)} detail="cards table" />
        <Metric label="Raw records" value={formatNumber(data.sourceRecords.length)} detail="tcg_source_records" />
        <Metric label="Taxonomy rows" value={formatNumber(taxonomyTotal)} detail="rarities, variants, set types" />
      </div>

      <section className="game-band">
        <div className="game-band-head">
          <div>
            <div className="game-kicker">Set hierarchy</div>
            <h2>Imported sets by type</h2>
          </div>
          <span>Latest source fetch: {formatDate(latestFetch)}</span>
        </div>
        <div className="game-type-grid">
          {setTypeCards.map((type) => (
            <div className="game-type-item" key={type.id}>
              <div className="game-type-name">{type.name ?? type.code ?? "Untyped"}</div>
              <div className="game-type-code">{type.code ?? "NO_CODE"}</div>
              <div className="game-type-count">
                {formatNumber(type.setCount)} sets / {formatNumber(type.cardCount)} cards
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="game-band">
        <div className="game-band-head">
          <div>
            <div className="game-kicker">Catalog sets</div>
            <h2>Catalog set rows</h2>
          </div>
          <span>{formatNumber(data.sets.reduce((sum, set) => sum + (set.card_count ?? 0), 0))} set-declared cards</span>
        </div>
        <div className="game-set-list">
          {data.sets.map((set) => {
            const setType = set.set_type_id ? setTypeById.get(set.set_type_id) : null;
            return (
              <Link
                key={set.id}
                className="game-set-row"
                href={gamePath(game.routeSlug, `/sets/${set.slug}`)}
                style={{ ["--set-color" as string]: set.color ?? "#4F8EF7" }}
              >
                <span className="game-set-code">{set.code ?? set.slug}</span>
                <span className="game-set-name">{set.name}</span>
                <span className="game-set-type">{setType?.name ?? "Untyped"}</span>
                <span className="game-set-cards">{formatNumber(set.card_count ?? 0)} cards</span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="game-two-col">
        <section className="game-band">
          <div className="game-band-head">
            <div>
              <div className="game-kicker">Taxonomy</div>
              <h2>Rarity and variant setup</h2>
            </div>
          </div>
          <TaxonomyList title="Rarities" rows={data.rarities} />
          <TaxonomyList title="Variants" rows={data.variants} />
        </section>

        <section className="game-band">
          <div className="game-band-head">
            <div>
              <div className="game-kicker">Source audit</div>
              <h2>Provider wiring</h2>
            </div>
          </div>
          <div className="game-source-list">
            <SourceLine label="Provider" value={metadataText(metadata, "catalog_provider", "unknown")} />
            <SourceLine label="Raw set records" value={formatNumber(sourceRecordsByType.set ?? 0)} />
            <SourceLine label="Raw card records" value={formatNumber(sourceRecordsByType.card ?? 0)} />
            <SourceLine label="Route slug" value={game.routeSlug} />
            {data.providerMappings.map((mapping) => (
              <SourceLine
                key={`${mapping.provider}-${mapping.source_game_slug}`}
                label={`${mapping.provider ?? "provider"} pricing`}
                value={mapping.is_active ? "Active" : "Deferred"}
              />
            ))}
          </div>
          {data.warnings.length > 0 && (
            <div className="game-warning">
              {data.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="game-band">
        <div className="game-band-head">
          <div>
            <div className="game-kicker">Sample cards</div>
            <h2>First catalog rows</h2>
          </div>
          <span>{formatNumber(data.sampleCards.length)} shown</span>
        </div>
        <div className="game-card-table">
          <div className="game-card-head">
            <span>Card</span>
            <span>Set</span>
            <span>Rarity</span>
            <span>Variant</span>
            <span>Type</span>
          </div>
          {data.sampleCards.map((card) => {
            const set = joinedSet(card);
            return (
              <Link className="game-card-row" key={card.id} href={gamePath(game.routeSlug, `/catalog/${card.id}`)}>
                <span>
                  <b>{card.card_number ?? card.card_image_id ?? "No number"}</b>
                  {card.name}
                </span>
                <span>{set?.code ?? "No set"}</span>
                <span>{card.rarity ?? "Unknown"}</span>
                <span>{card.variant_label ?? "Base"}</span>
                <span>{catalogCardDomains(card) ?? catalogCardType(card)}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="game-metric">
      <div className="game-metric-label">{label}</div>
      <div className="game-metric-value">{value}</div>
      <div className="game-metric-detail">{detail}</div>
    </div>
  );
}

function TaxonomyList({ title, rows }: { title: string; rows: TaxonomyRow[] }) {
  return (
    <div className="game-taxonomy">
      <h3>{title}</h3>
      <div>
        {rows.map((row) => (
          <span key={row.id}>{row.name ?? row.code ?? "Unknown"}</span>
        ))}
      </div>
    </div>
  );
}

function SourceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="game-source-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
