export interface CardData {
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
  image_url_preview: string | null;
}

export interface SetData {
  id: string;
  slug: string;
  code: string;
  name: string;
  series: string | null;
  color: string | null;
  year: number | null;
}

export interface PriceStatsData {
  market_avg: number | null;
  tcg_market: number | null;
  ebay_avg: number | null;
  tcg_low: number | null;
  tcg_mid: number | null;
  tcg_high: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  updated_at: string | null;
}

export interface PricePoint {
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

export interface CardDetailPayload {
  game: {
    id: string;
    slug: string;
    route_slug: string;
    name: string;
  };
  card: CardData;
  set: SetData | null;
  priceStats: PriceStatsData | null;
  priceHistory: PricePoint[];
  priceHistorySynthetic: boolean;
}
