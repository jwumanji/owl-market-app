import { NextResponse } from "next/server";
import { JustTCG } from "justtcg-js";

const GAME = "one-piece-card-game";

// Debug endpoint to inspect raw JustTCG API data for a set
// Usage: /api/debug/justtcg?set=awakening-of-the-new-era-one-piece-card-game&search=luffy
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const setSlug = searchParams.get("set");
  const search = searchParams.get("search")?.toLowerCase();

  // Auth disabled for debugging
  void token;

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
