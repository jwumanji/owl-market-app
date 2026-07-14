import { ONE_PIECE_JUSTTCG_GAME_SLUG, parseVariant } from "@/lib/games/one-piece";

const BASE = "https://api.justtcg.com/v1";
const GAME = ONE_PIECE_JUSTTCG_GAME_SLUG;

function headers(): HeadersInit {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error("JUSTTCG_API_KEY is not set");
  return { "x-api-key": key };
}

export interface JustTCGVariant {
  id: string;
  condition: string;
  printing: string;
  language: string;
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
  avgPrice90d?: number | null;
  minPrice90d?: number | null;
  maxPrice90d?: number | null;
  tcgplayerSkuId?: string | null;
  uuid?: string | null;
}

export interface JustTCGCard {
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

export interface JustTCGSealedProduct extends JustTCGCard {
  uuid?: string | null;
  details?: string | null;
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

/** Fetch all One Piece TCG sets, handling future pagination growth. */
export async function fetchSets(): Promise<JustTCGSet[]> {
  const all: JustTCGSet[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchJSON<PaginatedResponse<JustTCGSet>>(
      `${BASE}/sets?game=${GAME}&limit=100&offset=${offset}`
    );
    all.push(...res.data);
    if (!hasMore(res)) break;
    offset += 100;
  }

  return all;
}

/** Fetch all cards in a set, handling pagination (100 per page) */
export async function fetchCardsBySet(setSlug: string): Promise<JustTCGCard[]> {
  const all: JustTCGCard[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchJSON<PaginatedResponse<JustTCGCard>>(
      `${BASE}/cards?game=${GAME}&set=${encodeURIComponent(setSlug)}&include_price_history=false&limit=100&offset=${offset}`
    );
    all.push(...res.data);
    if (!hasMore(res)) break;
    offset += 100;
  }

  return all;
}

/**
 * Fetch every sealed One Piece SKU. JustTCG exposes TCGplayer sealed products
 * through the cards endpoint when condition=Sealed, including boxes, cases,
 * packs, displays, collections, and starter decks.
 */
export async function fetchSealedProducts(): Promise<JustTCGSealedProduct[]> {
  const all: JustTCGSealedProduct[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchJSON<PaginatedResponse<JustTCGSealedProduct>>(
      `${BASE}/cards?game=${GAME}&condition=Sealed&include_null_prices=true&include_price_history=false&limit=100&offset=${offset}`
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
