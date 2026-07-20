export interface PriceStats {
  market_avg: number | null;
  tcg_market: number | null;
  ebay_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
}

export interface SetInfo {
  id: string;
  slug: string;
  code: string;
  name: string;
  series: string | null;
  color: string | null;
  year: number | null;
}

export interface CardRow {
  id: string;
  card_image_id: string;
  card_number: string | null;
  name: string;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_type: string | null;
  color: string[];
  game_payload?: Record<string, unknown> | null;
  printed_set_code?: string | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview?: string | null;
  price_stats: PriceStats | null;
  sets: SetInfo | null;
}

export type Rarity = "C" | "UC" | "R" | "SR" | "SEC" | "L" | "SP" | "MR" | "TR" | "AA";

export type SortKey = "value" | "chg_1d" | "chg_7d" | "chg_30d";

/* ── Dashboard widget types ── */

export type MarketWindow = "1D" | "7D" | "30D" | "90D";

export type MarketWindowPayload<T> = Partial<Record<MarketWindow, T>>;

export interface DashboardCard {
  id: string;
  card_image_id: string;
  card_number: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview?: string | null;
  set_code: string | null;
  market_avg: number | null;
  changes: MarketWindowPayload<number | null>;
}

export interface RarityRankItem {
  slug: string;
  code: string;
  name: string;
  index_value: number;
  card_count: number;
  top_card_name: string | null;
  top_card_image_id: string | null;
  top_card_market: number | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  changes: MarketWindowPayload<number | null>;
}

export interface CharacterRankItem {
  name: string;
  slug: string;
  index_value: number;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  changes: MarketWindowPayload<number | null>;
}

export interface SealedRankItem {
  set_id: string | null;
  set_slug: string | null;
  name: string;
  set_code: string | null;
  product_type: string | null;
  market_avg: number | null;
  case_market_avg: number | null;
  total_set_value: number;
  image_url: string | null;
  image_url_fallback: string | null;
  changes: MarketWindowPayload<number | null>;
}

export interface EbaySaleItem {
  ebay_item_id: string;
  card_id: string;
  card_image_id: string;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  title: string | null;
  sale_price: number;
  currency: string | null;
  sold_at: string | null;
  ebay_url: string | null;
}

export interface DashboardData {
  topCards: MarketWindowPayload<DashboardCard[]>;
  topGainers: MarketWindowPayload<DashboardCard[]>;
  topLosers: MarketWindowPayload<DashboardCard[]>;
  topEbaySales: EbaySaleItem[];
  rarityRanking: MarketWindowPayload<RarityRankItem[]>;
  topCharacters: MarketWindowPayload<CharacterRankItem[]>;
  sealedBoxes: MarketWindowPayload<SealedRankItem[]>;
}
