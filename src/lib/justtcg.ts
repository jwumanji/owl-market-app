import { ONE_PIECE_JUSTTCG_GAME_SLUG, parseVariant } from "@/lib/games/one-piece";
import { JUSTTCG_NORMALIZED_API_BASE } from "@/lib/games/provider-contract";

const BASE = JUSTTCG_NORMALIZED_API_BASE;

function headers(): HeadersInit {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error("JUSTTCG_API_KEY is not set");
  return { "x-api-key": key };
}

export interface JustTCGVariant {
  uuid?: string;
  id: string;
  condition: string;
  printing: string;
  language: string;
  tcgplayerSkuId?: string | null;
  price: number | null;
  priceChange24hr: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  priceChange90d: number | null;
  avgPrice: number | null;
  minPrice7d: number | null;
  maxPrice7d: number | null;
  trendSlope7d: number | null;
  avgPrice30d: number | null;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  trendSlope30d: number | null;
  minPriceAllTime: number | null;
  maxPriceAllTime: number | null;
  lastUpdated?: number | null;
}

export interface JustTCGCard {
  uuid?: string;
  id: string;
  name: string;
  game: string;
  set: string;
  set_name: string;
  number: string;
  rarity: string;
  tcgplayerId: string | null;
  variants: JustTCGVariant[];
}

export interface JustTCGSet {
  id: string;
  name: string;
  game_id: string;
  count: number;
  cards_count: number;
  release_date: string | null;
  set_value_usd: number | null;
}

interface PageInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  meta?: PageInfo;
  pagination?: PageInfo;
}

function hasMore<T>(response: PaginatedResponse<T>) {
  return Boolean(response.pagination?.hasMore ?? response.meta?.hasMore);
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JustTCG ${res.status}: ${body}`);
  }
  return res.json();
}

/** Fetch every set for one provider game, handling future pagination growth. */
export async function fetchSets(
  gameSlug = ONE_PIECE_JUSTTCG_GAME_SLUG
): Promise<JustTCGSet[]> {
  const all: JustTCGSet[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchJSON<PaginatedResponse<JustTCGSet>>(
      `${BASE}/sets?game=${encodeURIComponent(gameSlug)}&limit=100&offset=${offset}`
    );
    all.push(...res.data);
    if (!hasMore(res)) break;
    offset += 100;
  }

  return all;
}

/** Fetch every card in one provider set, handling pagination (100 per page). */
export async function fetchCardsBySet(
  setSlug: string,
  gameSlug = ONE_PIECE_JUSTTCG_GAME_SLUG
): Promise<JustTCGCard[]> {
  const all: JustTCGCard[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchJSON<PaginatedResponse<JustTCGCard>>(
      `${BASE}/cards?game=${encodeURIComponent(gameSlug)}&set=${encodeURIComponent(setSlug)}&include_price_history=false&limit=100&offset=${offset}`
    );
    all.push(...res.data);
    if (!hasMore(res)) break;
    offset += 100;
  }

  return all;
}

/** Extract the Near Mint variant (prefer Foil for OPTCG) */
export function getNearMintPrice(card: JustTCGCard): JustTCGVariant | null {
  // Prefer NM Foil (most OPTCG cards are foil), fall back to NM Normal
  return (
    card.variants.find((v) => v.condition === "Near Mint" && v.printing === "Foil") ??
    card.variants.find((v) => v.condition === "Near Mint") ??
    null
  );
}

export { parseVariant };
