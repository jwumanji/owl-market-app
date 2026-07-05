import { NextResponse } from "next/server";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// GET /api/warm?pages=150&imageCards=50&offset=0&widths=384,640,828,1080
//
// Cache-warmer for the cold card-detail path. Re-renders card pages (ISR
// cache) and requests the hero image transforms real devices ask for, so a
// first visitor never pays a cold render or a cold /_next/image encode
// (~2.3s measured on the LCP path).
//
// Cron usage (vercel.json):
//   - post-sync:  ?pages=150&imageCards=50            (fresh prices, 4x/day)
//   - daily sweep: ?pages=0&imageCards=550&offset=K&widths=828
//     chunked across the whole priced catalog so every hero's mobile-critical
//     transform stays inside the 31-day image cache window.
// ---------------------------------------------------------------------------

// Hero rungs actual devices request at the 300px display size (1x → 384,
// 2x → 640, moto-g 2.625x → 828, iPhone 3x → 1080), matching quality=60.
const DEFAULT_WIDTHS = [384, 640, 828, 1080];
const ALLOWED_WIDTHS = new Set([384, 640, 750, 828, 1080]);
const HERO_QUALITY = 60;
const CONCURRENCY = 8;
// Stop launching new work near the function deadline so the run returns a
// partial report instead of being killed mid-flight.
const SOFT_DEADLINE_MS = 280_000;

function warmOrigin(request: Request) {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  return new URL(request.url).origin;
}

async function runPool(tasks: Array<() => Promise<boolean>>, deadlineAt: number) {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      if (Date.now() > deadlineAt) {
        skipped += 1;
        continue;
      }
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

  return { ok, failed, skipped };
}

function intParam(searchParams: URLSearchParams, name: string, fallback: number, max: number) {
  const raw = parseInt(searchParams.get(name) ?? "", 10);
  const value = Number.isFinite(raw) ? raw : fallback;
  return Math.max(0, Math.min(value, max));
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

  const offset = intParam(searchParams, "offset", 0, 20000);
  const pageCount = intParam(searchParams, "pages", 150, 1000);
  const imageCardCount = intParam(searchParams, "imageCards", 50, 1000);
  const widths = (searchParams.get("widths") ?? DEFAULT_WIDTHS.join(","))
    .split(",")
    .map((w) => parseInt(w, 10))
    .filter((w) => ALLOWED_WIDTHS.has(w));
  const startedAt = Date.now();
  const deadlineAt = startedAt + SOFT_DEADLINE_MS;

  const supabase = createServiceClient();
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id")
    .eq("slug", ONE_PIECE_DB_SLUG)
    .single();
  if (gameErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 500 });
  }

  const fetchCount = Math.max(pageCount, imageCardCount);
  if (fetchCount === 0) {
    return NextResponse.json({ error: "Nothing to warm (pages=0&imageCards=0)" }, { status: 400 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("price_stats")
    .select("cards!price_stats_card_game_fk!inner (card_image_id, image_url)")
    .eq("game_id", game.id)
    .not("market_avg", "is", null)
    .order("market_avg", { ascending: false })
    .range(offset, offset + Math.min(fetchCount, 1000) - 1);
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

  const pageTasks = cards.slice(0, pageCount).map((card) => async () => {
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
      // Only mirrored heroes: external sources (the ~125 broken-at-source
      // cards) 404 upstream and burn a 10s optimizer timeout each.
      if (!card.image_url?.includes("/storage/v1/object/public/card-images/")) return [];
      return widths.map((width) => async () => {
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

  const pages = await runPool(pageTasks, deadlineAt);
  const images = await runPool(imageTasks, deadlineAt);

  return NextResponse.json({
    origin,
    offset,
    widths,
    pages: { requested: pageTasks.length, ...pages },
    images: { requested: imageTasks.length, ...images },
    ms: Date.now() - startedAt,
  });
}
