import { NextResponse } from "next/server";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET /api/warm?pages=150&imageCards=50
//
// Cache-warmer for the cold card-detail path. Re-renders the top N card pages
// (ISR cache) and requests the hero image transforms real devices ask for, so
// a first visitor after a deploy or price sync never pays a cold render or a
// cold /_next/image encode. Scheduled 30min after each JustTCG sync cron.
// ---------------------------------------------------------------------------

// Hero rungs actual devices request at the 300px display size (1x → 384,
// 2x → 640, moto-g 2.625x → 828, iPhone 3x → 1080), matching quality=60.
const HERO_WIDTHS = [384, 640, 828, 1080];
const HERO_QUALITY = 60;
const CONCURRENCY = 8;

function warmOrigin(request: Request) {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  return new URL(request.url).origin;
}

async function runPool(tasks: Array<() => Promise<boolean>>) {
  let ok = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      try {
        if (await task()) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker())
  );

  return { ok, failed };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  const isAuthorized =
    request.headers.get("authorization") === `Bearer ${cronSecret}` ||
    searchParams.get("secret") === cronSecret;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pageCount = Math.min(parseInt(searchParams.get("pages") ?? "150", 10) || 150, 500);
  const imageCardCount = Math.min(parseInt(searchParams.get("imageCards") ?? "50", 10) || 50, pageCount);
  const startedAt = Date.now();

  const supabase = createServiceClient();
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id")
    .eq("slug", ONE_PIECE_DB_SLUG)
    .single();
  if (gameErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 500 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("price_stats")
    .select("cards!price_stats_card_game_fk!inner (card_image_id, image_url)")
    .eq("game_id", game.id)
    .not("market_avg", "is", null)
    .order("market_avg", { ascending: false })
    .limit(pageCount);
  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const cards = (rows ?? [])
    .map((row) => {
      const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
      return card as { card_image_id?: string; image_url?: string | null } | null;
    })
    .filter((card): card is { card_image_id: string; image_url: string | null } =>
      Boolean(card?.card_image_id)
    );

  const origin = warmOrigin(request);

  const pageTasks = cards.map((card) => async () => {
    const res = await fetch(
      `${origin}/games/${DEFAULT_PUBLIC_GAME_ROUTE_SLUG}/card/${encodeURIComponent(card.card_image_id)}`,
      { cache: "no-store", headers: { "user-agent": "OwlMarketWarmer/1.0" } }
    );
    // Drain so the connection is reusable.
    await res.arrayBuffer();
    return res.ok;
  });

  const imageTasks = cards
    .slice(0, imageCardCount)
    .flatMap((card) => {
      if (!card.image_url) return [];
      return HERO_WIDTHS.map((width) => async () => {
        const res = await fetch(
          `${origin}/_next/image?url=${encodeURIComponent(card.image_url as string)}&w=${width}&q=${HERO_QUALITY}`,
          {
            cache: "no-store",
            headers: {
              // Matches what browsers send, so the CDN caches the AVIF variant.
              accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              "user-agent": "OwlMarketWarmer/1.0",
            },
          }
        );
        await res.arrayBuffer();
        return res.ok;
      });
    });

  const pages = await runPool(pageTasks);
  const images = await runPool(imageTasks);

  return NextResponse.json({
    origin,
    pages: { requested: pageTasks.length, ...pages },
    images: { requested: imageTasks.length, ...images },
    ms: Date.now() - startedAt,
  });
}
