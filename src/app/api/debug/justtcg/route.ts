import { NextResponse } from "next/server";
import { JustTCG } from "justtcg-js";
import { ONE_PIECE_JUSTTCG_GAME_SLUG } from "@/lib/games/one-piece";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";

const GAME = ONE_PIECE_JUSTTCG_GAME_SLUG;

// Debug endpoint to inspect raw JustTCG API data for a set
// Usage: /api/debug/justtcg?set=awakening-of-the-new-era-one-piece-card-game&search=luffy
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const setSlug = searchParams.get("set");
  const search = searchParams.get("search")?.toLowerCase();

  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!setSlug) {
    return NextResponse.json({ error: "Provide ?set=<justtcg-slug>" }, { status: 400 });
  }

  const client = new JustTCG();

  const response = await client.v1.cards.get({
    game: GAME,
    set: setSlug,
    include_statistics: ["30d"],
    include_null_prices: false,
    limit: 200,
    offset: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cards: any[] = response.data ?? [];

  // Filter by search term if provided
  if (search) {
    cards = cards.filter((c) =>
      (c.name ?? "").toLowerCase().includes(search)
    );
  }

  // Return raw card data with all variants
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = cards.map((c: any) => ({
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: c.variants?.map((v: any) => ({
      printing: v.printing,
      condition: v.condition,
      price: v.price,
      avgPrice: v.avgPrice,
      avgPrice30d: v.avgPrice30d,
    })),
  }));

  return NextResponse.json({
    total: result.length,
    cards: result,
  });
}
