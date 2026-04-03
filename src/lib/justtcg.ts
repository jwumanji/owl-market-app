const BASE = "https://api.justtcg.com/v1";
const GAME = "one-piece-card-game";

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

export interface JustTCGSet {
  id: string;
  name: string;
  game_id: string;
  count: number;
  cards_count: number;
  release_date: string | null;
  set_value_usd: number | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JustTCG ${res.status}: ${body}`);
  }
  return res.json();
}

/** Fetch all One Piece TCG sets */
export async function fetchSets(): Promise<JustTCGSet[]> {
  const res = await fetchJSON<PaginatedResponse<JustTCGSet>>(
    `${BASE}/sets?game=${GAME}&limit=100`
  );
  return res.data;
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
    if (!res.meta.hasMore) break;
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

/**
 * Parse variant type from JustTCG card name.
 * Returns null for base cards, "Parallel" for parallels, etc.
 */
export function parseVariant(name: string): string | null {
  if (/\(Parallel\)/i.test(name)) return "Parallel";
  if (/\(Alternate Art\).*\(Manga\)/i.test(name)) return "Manga";
  if (/\(Alternate Art\)/i.test(name)) return "Alternate Art";
  if (/\(SP\).*\(Gold\)/i.test(name)) return "SP Gold";
  if (/\(SP\)/i.test(name)) return "SP";
  if (/\(Wanted Poster\)/i.test(name)) return "Wanted Poster";
  if (/\(Reprint\)/i.test(name)) return "Reprint";
  return null;
}
