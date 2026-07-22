import CardDetailClient from "@/app/card/[id]/CardDetailClient";
import { loadCardCore } from "@/app/card/[id]/card-detail-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gameQueryValue } from "@/lib/game-routes";
import { createServiceClient } from "@/lib/supabase-server";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// Card detail pages stay available through on-demand rendering (dynamicParams
// defaults to true) and are cached by ISR after the first request. Operators
// can opt a small hot set into build-time rendering, but the safe default is
// zero so deployments do not depend on catalog size or database headroom.
const STATIC_CARD_COUNT = Number(process.env.CARD_STATIC_PARAMS_COUNT ?? 0);

export async function generateStaticParams() {
  try {
    const supabase = createServiceClient();
    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("slug", ONE_PIECE_DB_SLUG)
      .single();
    if (!game) return [];

    // PostgREST caps a single request at 1000 rows — page through.
    const ids: string[] = [];
    const pageSize = 1000;
    for (let from = 0; ids.length < STATIC_CARD_COUNT; from += pageSize) {
      const { data: rows } = await supabase
        .from("price_stats")
        .select("cards!price_stats_card_game_fk!inner (card_image_id)")
        .eq("game_id", game.id)
        .not("market_avg", "is", null)
        .order("market_avg", { ascending: false })
        .range(from, Math.min(from + pageSize, STATIC_CARD_COUNT) - 1);

      if (!rows || rows.length === 0) break;
      for (const row of rows) {
        const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
        const id = (card as { card_image_id?: string } | null)?.card_image_id;
        if (id) ids.push(id);
      }
      if (rows.length < pageSize) break;
    }

    return ids.map((id) => ({ game: DEFAULT_PUBLIC_GAME_ROUTE_SLUG, id }));
  } catch (error) {
    // A build must never fail because the DB was unreachable — the pages
    // just fall back to on-demand rendering.
    console.warn("generateStaticParams(card) skipped:", error);
    return [];
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ game: string; id: string }>;
  }
) {
  const params = await props.params;
  return {
    title: `${decodeURIComponent(params.id)} - ${params.game.replace(/-/g, " ")} card - Moon Market`,
  };
}

export default async function GameCardDetailPage(
  props: {
    params: Promise<{ game: string; id: string }>;
  }
) {
  const params = await props.params;
  const result = await loadCardCore({
    id: params.id,
    game: gameQueryValue(params.game),
  });

  // History + market extras load client-side (/api/card/[id]/history and
  // /extras) so prerendering this page costs the core query alone.
  return (
    <CardDetailClient
      data={result.ok ? result.data : null}
      error={result.ok ? null : result.message}
      gameRouteSlug={params.game}
    />
  );
}
