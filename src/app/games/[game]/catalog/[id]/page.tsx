import Link from "next/link";
import { notFound } from "next/navigation";
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
  catalogCardPayload,
  catalogCardType,
  catalogSourcePayload,
} from "@/lib/catalog-card-fields";
import { catalogCardDescription } from "@/lib/game-catalog-copy";
import "../catalog.css";

export const dynamic = "force-dynamic";

type SetInfo = {
  id: string;
  slug: string | null;
  code: string | null;
  name: string | null;
  year: number | null;
};

type CardRow = {
  id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  name_base: string | null;
  rarity: string | null;
  rarity_id: string | null;
  variant_label: string | null;
  variant_id: string | null;
  card_type: string | null;
  color: string[] | string | null;
  image_url: string | null;
  image_url_small: string | null;
  game_payload: Record<string, unknown> | null;
  sets: SetInfo | SetInfo[] | null;
};

type ExternalIdRow = {
  provider: string | null;
  external_type: string | null;
  external_id: string | null;
  metadata: Record<string, unknown> | null;
};

type DetailData =
  | {
      ok: true;
      game: GameScope;
      card: CardRow;
      externalIds: ExternalIdRow[];
    }
  | {
      ok: false;
      gameName: string;
      message: string;
      status?: number;
    };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function joinedSet(row: CardRow) {
  if (Array.isArray(row.sets)) return row.sets[0] ?? null;
  return row.sets;
}

function readableValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    const clean = value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
    return clean.length > 0 ? clean.join(", ") : "—";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function payloadRows(payload: Record<string, unknown>) {
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key: key.replace(/_/g, " "),
      value: readableValue(value),
    }));
}

async function loadCardDetail(gameRouteSlug: string, rawId: string): Promise<DetailData> {
  try {
    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
      defaultToOnePiece: false,
      publicOnly: publicOnlyForCatalogPreview(),
    });

    if (gameResult.error) {
      return { ok: false, gameName: gameRouteSlug, message: gameResult.error.message, status: gameResult.error.status };
    }

    const game = gameResult.game;
    const id = decodeURIComponent(rawId);
    let cardQuery = supabase
      .from("cards")
      .select(`
        id,
        card_image_id,
        card_number,
        name,
        name_base,
        rarity,
        rarity_id,
        variant_label,
        variant_id,
        card_type,
        color,
        image_url,
        image_url_small,
        game_payload,
        sets (id, slug, code, name, year)
      `)
      .eq("game_id", game.id)
      .limit(1);

    cardQuery = isUuid(id) ? cardQuery.eq("id", id) : cardQuery.eq("card_image_id", id);
    const { data: cardData, error: cardError } = await cardQuery.maybeSingle();

    if (cardError) {
      return { ok: false, gameName: game.name, message: cardError.message, status: 500 };
    }
    if (!cardData) {
      return { ok: false, gameName: game.name, message: "Card not found", status: 404 };
    }

    const card = cardData as unknown as CardRow;
    const { data: externalRows } = await supabase
      .from("card_external_ids")
      .select("provider, external_type, external_id, metadata")
      .eq("game_id", game.id)
      .eq("card_id", card.id)
      .order("provider")
      .order("external_type");

    return {
      ok: true,
      game,
      card,
      externalIds: (externalRows ?? []) as ExternalIdRow[],
    };
  } catch (error) {
    return {
      ok: false,
      gameName: gameRouteSlug,
      message: error instanceof Error ? error.message : "Unable to load catalog card.",
      status: 500,
    };
  }
}

export async function generateMetadata({
  params,
}: {
  params: { game: string; id: string };
}) {
  return {
    title: `${decodeURIComponent(params.id)} - ${params.game.replace(/-/g, " ")} card - OWL Market`,
  };
}

export default async function GameCatalogCardPage({
  params,
}: {
  params: { game: string; id: string };
}) {
  const data = await loadCardDetail(params.game, params.id);

  if (!data.ok) {
    if (data.status === 404) notFound();
    return (
      <section className="catalog-page">
        <div className="catalog-error">
          <div className="catalog-kicker">Catalog card</div>
          <h1>{data.gameName}</h1>
          <p>{data.message}</p>
        </div>
      </section>
    );
  }

  const { game, card } = data;
  const set = joinedSet(card);
  const cardInfo = catalogCardPayload(card);
  const sourceInfo = catalogSourcePayload(card);
  const details = payloadRows(cardInfo);
  const sourceDetails = payloadRows(sourceInfo);

  return (
    <section className="catalog-page">
      <div className="catalog-breadcrumb">
        <Link href={gamePath(game.routeSlug)}>{game.name}</Link>
        <span>/</span>
        <Link href={gamePath(game.routeSlug, "/catalog")}>Cards</Link>
        <span>/</span>
        <span>{card.card_number ?? card.name}</span>
      </div>

      <div className="catalog-card-detail-hero">
        <div className="catalog-card-art" aria-hidden="true">
          {card.image_url_small || card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image_url_small ?? card.image_url ?? ""} alt="" />
          ) : (
            <span>{set?.code ?? "RB"}</span>
          )}
        </div>
        <div>
          <div className="catalog-kicker">Catalog card</div>
          <h1>{card.name}</h1>
          <div className="catalog-card-meta">
            <span>{card.card_number ?? card.card_image_id ?? "No number"}</span>
            <span>{set?.code ?? "No set"}</span>
            <span>{card.rarity ?? "Unknown rarity"}</span>
            <span>{card.variant_label ?? "Base"}</span>
          </div>
          <p>{catalogCardDescription(game)}</p>
        </div>
      </div>

      <div className="catalog-detail-grid">
        <section className="catalog-detail-panel">
          <div className="catalog-panel-head">
            <div className="catalog-kicker">Card summary</div>
            <h2>Core fields</h2>
          </div>
          <DetailLine label="Set" value={set?.name ? `${set.code ?? ""} ${set.name}`.trim() : "No set"} />
          <DetailLine label="Type" value={catalogCardType(card)} />
          <DetailLine label="Domain" value={catalogCardDomains(card) ?? "—"} />
          <DetailLine label="Cost" value={catalogCardCost(card)} />
          <DetailLine label="Rarity" value={card.rarity ?? "Unknown"} />
          <DetailLine label="Variant" value={card.variant_label ?? "Base"} />
        </section>

        <section className="catalog-detail-panel">
          <div className="catalog-panel-head">
            <div className="catalog-kicker">Identifiers</div>
            <h2>Provider keys</h2>
          </div>
          <DetailLine label="Internal ID" value={card.id} />
          <DetailLine label="Image key" value={card.card_image_id ?? "—"} />
          {data.externalIds.length === 0 ? (
            <DetailLine label="External IDs" value="No external IDs recorded" />
          ) : (
            data.externalIds.map((externalId) => (
              <DetailLine
                key={`${externalId.provider}-${externalId.external_type}-${externalId.external_id}`}
                label={`${externalId.provider ?? "provider"} ${externalId.external_type ?? "id"}`}
                value={externalId.external_id ?? "—"}
              />
            ))
          )}
        </section>
      </div>

      <section className="catalog-detail-panel">
        <div className="catalog-panel-head">
          <div className="catalog-kicker">Game payload</div>
          <h2>{game.name} metadata</h2>
        </div>
        <div className="catalog-payload-grid">
          {details.length === 0 ? (
            <div className="catalog-empty">No game payload fields recorded.</div>
          ) : (
            details.map((row) => <DetailLine key={row.key} label={row.key} value={row.value} />)
          )}
        </div>
      </section>

      {sourceDetails.length > 0 && (
        <section className="catalog-detail-panel">
          <div className="catalog-panel-head">
            <div className="catalog-kicker">Source</div>
            <h2>Import metadata</h2>
          </div>
          <div className="catalog-payload-grid">
            {sourceDetails.map((row) => <DetailLine key={row.key} label={row.key} value={row.value} />)}
          </div>
        </section>
      )}
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="catalog-detail-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
