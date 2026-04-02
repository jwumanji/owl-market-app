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
  image_url: string | null;
  image_url_small: string | null;
  price_stats: PriceStats | null;
  sets: SetInfo | null;
}

export type Rarity = "C" | "UC" | "R" | "SR" | "SEC" | "L" | "SP" | "MR" | "TR" | "AA";

export type SortKey = "value" | "chg_1d" | "chg_7d" | "chg_30d";
