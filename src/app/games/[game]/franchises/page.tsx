import Link from "next/link";
import { redirect } from "next/navigation";
import { gamePath } from "@/lib/game-routes";
import {
  publicOnlyForCatalogPreview,
  resolveGameScope,
  type GameScope,
} from "@/lib/game-scope";
import { LORCANA_ROUTE_SLUG } from "@/lib/games/lorcana";
import {
  cachedPublicData,
  CATALOG_DATA_TTL_SECONDS,
  publicDataCacheKey,
} from "@/lib/public-data-cache";
import { createCachedServiceClient } from "@/lib/supabase-server";
import "../catalog/catalog.css";
import "./franchises.css";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type FranchiseRow = {
  attribute: string | null;
};

type Franchise = {
  name: string;
  cardCount: number;
};

type FranchiseData =
  | {
      ok: true;
      game: GameScope;
      franchises: Franchise[];
      totalCards: number;
    }
  | {
      ok: false;
      gameName: string;
      message: string;
    };

async function loadFranchisesUncached(gameRouteSlug: string): Promise<FranchiseData> {
  try {
    const supabase = createCachedServiceClient(CATALOG_DATA_TTL_SECONDS);
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

    const rows: FranchiseRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("cards")
        .select("attribute")
        .eq("game_id", gameResult.game.id)
        .eq("region", "en")
        .not("attribute", "is", null)
        .order("attribute")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return {
          ok: false,
          gameName: gameResult.game.name,
          message: error.message,
        };
      }

      const page = (data ?? []) as FranchiseRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const franchise = row.attribute?.trim();
      if (!franchise) continue;
      counts.set(franchise, (counts.get(franchise) ?? 0) + 1);
    }

    const franchises = [...counts]
      .map(([name, cardCount]) => ({ name, cardCount }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      ok: true,
      game: gameResult.game,
      franchises,
      totalCards: rows.length,
    };
  } catch (error) {
    return {
      ok: false,
      gameName: gameRouteSlug,
      message: error instanceof Error ? error.message : "Unable to load franchises.",
    };
  }
}

function loadFranchises(gameRouteSlug: string) {
  return cachedPublicData(
    publicDataCacheKey("lorcana-franchise-index", gameRouteSlug),
    () => loadFranchisesUncached(gameRouteSlug),
    CATALOG_DATA_TTL_SECONDS
  );
}

export async function generateMetadata() {
  return {
    title: "Lorcana franchises - Moon Market",
    description: "Browse Disney Lorcana cards by story and franchise.",
  };
}

export default async function GameFranchisesPage(
  props: {
    params: Promise<{ game: string }>;
  }
) {
  const params = await props.params;
  if (params.game !== LORCANA_ROUTE_SLUG) {
    redirect(gamePath(params.game, "/catalog"));
  }

  const data = await loadFranchises(params.game);
  if (!data.ok) {
    return (
      <section className="catalog-page">
        <div className="catalog-error">
          <div className="catalog-kicker">Franchises</div>
          <h1>{data.gameName}</h1>
          <p>{data.message}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="catalog-page">
      <div className="catalog-breadcrumb">
        <Link href={gamePath(data.game.routeSlug)}>{data.game.name}</Link>
        <span>›</span>
        <span>Franchises</span>
      </div>

      <header className="catalog-hero">
        <div>
          <div className="catalog-kicker">Browse by story</div>
          <h1>Franchises</h1>
          <p>
            Explore Lorcana by the Disney story attached to each printing—from
            Frozen and Aladdin to Mickey Mouse &amp; Friends.
          </p>
        </div>
        <div className="catalog-count">
          <span>{data.franchises.length.toLocaleString("en-US")}</span>
          stories
        </div>
      </header>

      <div className="franchise-summary">
        {data.totalCards.toLocaleString("en-US")} catalog cards grouped by story
      </div>

      <div className="franchise-grid">
        {data.franchises.map((franchise) => (
          <Link
            key={franchise.name}
            className="franchise-card"
            href={`${gamePath(data.game.routeSlug, "/catalog")}?franchise=${encodeURIComponent(franchise.name)}`}
          >
            <span>Disney story</span>
            <h2>{franchise.name}</h2>
            <strong>
              {franchise.cardCount.toLocaleString("en-US")}{" "}
              {franchise.cardCount === 1 ? "card" : "cards"}
            </strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
