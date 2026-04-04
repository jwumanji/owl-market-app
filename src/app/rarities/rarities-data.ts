export interface RarityCard {
  name: string;
  set: string;
  rarity: string;
  tcg: number;
  avg: number;
  chg1d: number;
  chg7d: number;
  chg30d: number;
  spark: number[];
}

export interface RarityData {
  slug: string;
  name: string;
  code: string;
  subtitle: string;
  color: string;
  colorD: string;
  colorBd: string;
  indexValue: number;
  cardCount: number;
  avgCardPrice: number;
  chg7d: number;
  chg30d: number;
  up: boolean;
  spark: number[];
  topCards: RarityCard[];
}

/* ── Fixed tier ordering ── */
export const TOP_5_SLUGS = ["mr", "promo", "sp", "aa", "sealed"] as const;
export const TIER_2_SLUGS = ["sec", "tr", "sr", "l", "r"] as const;

export const RARITY_META: Record<string, { name: string; subtitle: string; color: string; colorD: string; colorBd: string }> = {
  MR:     { name: "Manga Rare",    subtitle: "Ultra-premium chase cards with manga panel art",       color: "#E8A020", colorD: "rgba(232,160,32,0.18)",  colorBd: "rgba(232,160,32,0.38)" },
  GMR:    { name: "Golden MR",     subtitle: "Gold-foil manga rares — the rarest pulls",             color: "#F5BE50", colorD: "rgba(245,190,80,0.25)",  colorBd: "rgba(245,190,80,0.5)" },
  SP:     { name: "Special Rare",  subtitle: "Alternate art special rares with unique treatments",    color: "#9B72FF", colorD: "rgba(155,114,255,0.14)", colorBd: "rgba(155,114,255,0.3)" },
  SEC:    { name: "Secret Rare",   subtitle: "Case-hit secret rares with holographic finishes",       color: "#FF4560", colorD: "rgba(255,69,96,0.14)",   colorBd: "rgba(255,69,96,0.3)" },
  TR:     { name: "Treasure Rare", subtitle: "Box-topper treasure rares with premium foiling",        color: "#EAB308", colorD: "rgba(234,179,8,0.18)",   colorBd: "rgba(234,179,8,0.3)" },
  AA:     { name: "Alt Art",       subtitle: "Alternate artwork variants of existing cards",          color: "#4F8EF7", colorD: "rgba(79,142,247,0.14)",  colorBd: "rgba(79,142,247,0.3)" },
  SR:     { name: "Super Rare",    subtitle: "High-rarity staples and competitive powerhouses",       color: "#00D68F", colorD: "rgba(0,214,143,0.14)",   colorBd: "rgba(0,214,143,0.3)" },
  L:      { name: "Leader",        subtitle: "Deck-defining leader cards for every color",            color: "#00D68F", colorD: "rgba(0,214,143,0.14)",   colorBd: "rgba(0,214,143,0.3)" },
  R:      { name: "Rare",          subtitle: "Core rare cards forming the backbone of decks",         color: "#4F8EF7", colorD: "rgba(79,142,247,0.14)",  colorBd: "rgba(79,142,247,0.3)" },
  UC:     { name: "Uncommon",      subtitle: "Mid-tier uncommons with steady utility",                color: "#7A88A8", colorD: "rgba(122,136,168,0.12)", colorBd: "rgba(122,136,168,0.25)" },
  C:      { name: "Common",        subtitle: "Bulk commons — high supply, low individual value",      color: "#555E6E", colorD: "rgba(85,94,110,0.12)",   colorBd: "rgba(85,94,110,0.25)" },
  PROMO:  { name: "Promos",        subtitle: "Promotional cards from events, pre-releases & exclusives", color: "#F5A623", colorD: "rgba(245,166,35,0.18)", colorBd: "rgba(245,166,35,0.38)" },
  SEALED: { name: "Sealed Boxes",  subtitle: "Sealed product cost index across all booster sets",     color: "#20C9B0", colorD: "rgba(32,201,176,0.18)", colorBd: "rgba(32,201,176,0.38)" },
};

export const RARITIES: RarityData[] = [
  {
    slug: "mr", name: "Manga Rare", code: "MR", subtitle: "Ultra-premium chase cards with manga panel art",
    color: "#E8A020", colorD: "rgba(232,160,32,0.18)", colorBd: "rgba(232,160,32,0.38)",
    indexValue: 8420, cardCount: 18, avgCardPrice: 467.78, chg7d: 8.4, chg30d: 24.6, up: true,
    spark: [4, 5, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14],
    topCards: [
      { name: "Monkey D. Luffy MR", set: "OP01", rarity: "MR", tcg: 1240, avg: 1310, chg1d: 8.2, chg7d: 12.4, chg30d: 41, spark: [4, 5, 6, 6, 8, 10, 11, 12, 13] },
      { name: "Gol D. Roger GMR", set: "OP09", rarity: "GMR", tcg: 680, avg: 700, chg1d: -1.2, chg7d: 3.4, chg30d: 22, spark: [6, 6, 7, 7, 7, 7, 7, 7, 8] },
      { name: "Shanks MR", set: "OP09", rarity: "MR", tcg: 520, avg: 540, chg1d: 4.1, chg7d: 9.8, chg30d: 31, spark: [4, 5, 5, 6, 7, 8, 8, 9, 9] },
      { name: "Mihawk MR", set: "OP14", rarity: "MR", tcg: 420, avg: 440, chg1d: 12.4, chg7d: 28.6, chg30d: 62, spark: [3, 4, 5, 7, 9, 12, 15, 18, 20] },
      { name: "Katakuri MR", set: "OP05", rarity: "MR", tcg: 380, avg: 395, chg1d: 2.8, chg7d: 6.1, chg30d: 24, spark: [5, 5, 6, 6, 7, 7, 8, 8, 8] },
    ],
  },
  {
    slug: "promo", name: "Promos", code: "PROMO", subtitle: "Promotional cards from events, pre-releases & exclusives",
    color: "#F5A623", colorD: "rgba(245,166,35,0.18)", colorBd: "rgba(245,166,35,0.38)",
    indexValue: 0, cardCount: 0, avgCardPrice: 0, chg7d: 0, chg30d: 0, up: true,
    spark: [],
    topCards: [],
  },
  {
    slug: "sp", name: "Special Rare", code: "SP", subtitle: "Alternate art special rares with unique treatments",
    color: "#9B72FF", colorD: "rgba(155,114,255,0.14)", colorBd: "rgba(155,114,255,0.3)",
    indexValue: 3240, cardCount: 32, avgCardPrice: 101.25, chg7d: 6.2, chg30d: 18.4, up: true,
    spark: [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
    topCards: [
      { name: "Luffy SP", set: "OP01", rarity: "SP", tcg: 180, avg: 187, chg1d: 34.5, chg7d: 41.2, chg30d: 85, spark: [4, 5, 6, 8, 10, 14, 17, 18, 18] },
      { name: "Doflamingo SP", set: "OP01", rarity: "SP", tcg: 145, avg: 148, chg1d: 3.1, chg7d: 8.4, chg30d: 19, spark: [5, 5, 6, 7, 8, 9, 9, 10, 10] },
      { name: "Boa Hancock SP", set: "OP01", rarity: "SP", tcg: 95, avg: 96, chg1d: 2.1, chg7d: 6.3, chg30d: 28, spark: [4, 5, 5, 6, 7, 8, 9, 9, 9] },
      { name: "Yamato SP", set: "OP05", rarity: "SP", tcg: 72, avg: 74, chg1d: 6.2, chg7d: 14.1, chg30d: 38, spark: [3, 4, 4, 5, 6, 7, 8, 9, 9] },
      { name: "Nami SP", set: "OP14", rarity: "SP", tcg: 46, avg: 48, chg1d: 4.8, chg7d: 11.2, chg30d: 28, spark: [3, 3, 4, 4, 5, 6, 7, 8, 9] },
    ],
  },
  {
    slug: "aa", name: "Alt Art", code: "AA", subtitle: "Alternate artwork variants of existing cards",
    color: "#4F8EF7", colorD: "rgba(79,142,247,0.14)", colorBd: "rgba(79,142,247,0.3)",
    indexValue: 1480, cardCount: 22, avgCardPrice: 67.27, chg7d: -1.4, chg30d: 4.8, up: false,
    spark: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    topCards: [
      { name: "Roronoa Zoro AA", set: "OP02", rarity: "AA", tcg: 62, avg: 60, chg1d: -3.4, chg7d: -5.1, chg30d: -12, spark: [7, 7, 6, 6, 5, 5, 4, 4, 4] },
      { name: "Mihawk SEC AA", set: "OP14", rarity: "AA", tcg: 28, avg: 26, chg1d: -6.7, chg7d: -9.2, chg30d: -14, spark: [8, 8, 7, 6, 5, 4, 3, 3, 3] },
      { name: "Law AA", set: "OP05", rarity: "AA", tcg: 24, avg: 25, chg1d: 1.2, chg7d: 2.8, chg30d: 8, spark: [4, 4, 4, 5, 5, 5, 5, 5, 5] },
      { name: "Nami AA", set: "OP09", rarity: "AA", tcg: 18, avg: 19, chg1d: 0.4, chg7d: 1.6, chg30d: 4, spark: [4, 4, 4, 4, 4, 5, 5, 5, 5] },
      { name: "Sanji AA", set: "OP06", rarity: "AA", tcg: 15, avg: 16, chg1d: -0.8, chg7d: -1.2, chg30d: 2, spark: [5, 5, 5, 5, 5, 5, 5, 5, 5] },
    ],
  },
  {
    slug: "sealed", name: "Sealed Boxes", code: "SEALED", subtitle: "Sealed product cost index across all booster sets",
    color: "#20C9B0", colorD: "rgba(32,201,176,0.18)", colorBd: "rgba(32,201,176,0.38)",
    indexValue: 0, cardCount: 0, avgCardPrice: 0, chg7d: 0, chg30d: 0, up: true,
    spark: [],
    topCards: [],
  },
  {
    slug: "sec", name: "Secret Rare", code: "SEC", subtitle: "Case-hit secret rares with holographic finishes",
    color: "#FF4560", colorD: "rgba(255,69,96,0.14)", colorBd: "rgba(255,69,96,0.3)",
    indexValue: 2640, cardCount: 28, avgCardPrice: 94.29, chg7d: 3.8, chg30d: 14.2, up: true,
    spark: [5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8],
    topCards: [
      { name: "Luffy SEC", set: "OP14", rarity: "SEC", tcg: 84, avg: 88, chg1d: 8.2, chg7d: 18.4, chg30d: 42, spark: [3, 3, 4, 5, 7, 9, 11, 13, 14] },
      { name: "Yamato SEC", set: "OP05", rarity: "SEC", tcg: 68, avg: 70, chg1d: 4.8, chg7d: 9.1, chg30d: 32, spark: [4, 4, 5, 5, 6, 7, 7, 7, 7] },
      { name: "Shanks SEC", set: "OP01", rarity: "SEC", tcg: 41.2, avg: 47, chg1d: -2.1, chg7d: -5.4, chg30d: 18, spark: [6, 6, 5, 5, 4, 4, 4, 4, 4] },
      { name: "Ace SEC", set: "OP02", rarity: "SEC", tcg: 38, avg: 40, chg1d: -1.2, chg7d: -2.8, chg30d: 6, spark: [5, 5, 5, 4, 4, 4, 4, 4, 4] },
      { name: "Zoro SEC", set: "OP06", rarity: "SEC", tcg: 32, avg: 34, chg1d: 1.4, chg7d: 3.2, chg30d: 12, spark: [4, 4, 5, 5, 5, 5, 5, 6, 6] },
    ],
  },
  {
    slug: "tr", name: "Treasure Rare", code: "TR", subtitle: "Box-topper treasure rares with premium foiling",
    color: "#EAB308", colorD: "rgba(234,179,8,0.18)", colorBd: "rgba(234,179,8,0.3)",
    indexValue: 1860, cardCount: 14, avgCardPrice: 132.86, chg7d: 5.1, chg30d: 16.8, up: true,
    spark: [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 9],
    topCards: [
      { name: "Zoro TR", set: "OP14", rarity: "TR", tcg: 58, avg: 60, chg1d: 6.4, chg7d: 14.2, chg30d: 38, spark: [3, 3, 4, 5, 6, 8, 9, 11, 12] },
      { name: "Blackbeard TR", set: "OP02", rarity: "TR", tcg: 22, avg: 23, chg1d: 1.5, chg7d: 5.8, chg30d: 11, spark: [4, 4, 4, 5, 5, 5, 6, 6, 6] },
      { name: "Law TR", set: "OP05", rarity: "TR", tcg: 18, avg: 19, chg1d: 0.8, chg7d: 2.4, chg30d: 8, spark: [4, 4, 4, 4, 5, 5, 5, 5, 5] },
      { name: "Kaido TR", set: "OP09", rarity: "TR", tcg: 16, avg: 17, chg1d: -0.4, chg7d: 1.2, chg30d: 6, spark: [4, 4, 4, 4, 4, 4, 5, 5, 5] },
      { name: "Nami TR", set: "OP06", rarity: "TR", tcg: 14, avg: 15, chg1d: 1.2, chg7d: 3.4, chg30d: 10, spark: [4, 4, 4, 4, 5, 5, 5, 5, 5] },
    ],
  },
  {
    slug: "sr", name: "Super Rare", code: "SR", subtitle: "High-rarity staples and competitive powerhouses",
    color: "#00D68F", colorD: "rgba(0,214,143,0.14)", colorBd: "rgba(0,214,143,0.3)",
    indexValue: 4860, cardCount: 186, avgCardPrice: 26.13, chg7d: 2.4, chg30d: 8.6, up: true,
    spark: [4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6],
    topCards: [
      { name: "Shanks Leader SR", set: "OP09", rarity: "SR", tcg: 28, avg: 29, chg1d: 2.4, chg7d: 6.2, chg30d: 18, spark: [4, 4, 4, 5, 5, 6, 6, 6, 7] },
      { name: "Kaido SR", set: "OP05", rarity: "SR", tcg: 18, avg: 19, chg1d: 0.8, chg7d: 2.4, chg30d: 8, spark: [4, 4, 4, 4, 5, 5, 5, 5, 5] },
      { name: "Boa Hancock SR", set: "OP05", rarity: "SR", tcg: 16, avg: 17, chg1d: 0.4, chg7d: 1.8, chg30d: 6, spark: [4, 4, 4, 4, 4, 4, 5, 5, 5] },
      { name: "Vegapunk SR", set: "OP09", rarity: "SR", tcg: 14, avg: 14, chg1d: 0.2, chg7d: 0.8, chg30d: 4, spark: [4, 4, 4, 4, 4, 4, 4, 5, 5] },
      { name: "Jinbe SR", set: "OP09", rarity: "SR", tcg: 12, avg: 12, chg1d: -0.3, chg7d: 0.4, chg30d: 2, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
    ],
  },
  {
    slug: "l", name: "Leader", code: "L", subtitle: "Deck-defining leader cards for every color",
    color: "#00D68F", colorD: "rgba(0,214,143,0.14)", colorBd: "rgba(0,214,143,0.3)",
    indexValue: 1240, cardCount: 48, avgCardPrice: 25.83, chg7d: 1.8, chg30d: 6.4, up: true,
    spark: [4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    topCards: [
      { name: "Shanks Leader", set: "OP01", rarity: "L", tcg: 22, avg: 24, chg1d: 1.2, chg7d: 3.4, chg30d: 12, spark: [4, 4, 4, 5, 5, 5, 5, 6, 6] },
      { name: "Luffy Leader", set: "OP05", rarity: "L", tcg: 18, avg: 19, chg1d: 0.6, chg7d: 2.1, chg30d: 8, spark: [4, 4, 4, 4, 5, 5, 5, 5, 5] },
      { name: "Kaido Leader", set: "OP02", rarity: "L", tcg: 14, avg: 15, chg1d: -0.4, chg7d: 0.8, chg30d: 4, spark: [4, 4, 4, 4, 4, 4, 4, 5, 5] },
      { name: "Law Leader", set: "OP09", rarity: "L", tcg: 12, avg: 13, chg1d: 0.2, chg7d: 1.4, chg30d: 6, spark: [4, 4, 4, 4, 4, 4, 5, 5, 5] },
      { name: "Zoro Leader", set: "OP14", rarity: "L", tcg: 10, avg: 11, chg1d: 0.8, chg7d: 2.6, chg30d: 10, spark: [4, 4, 4, 4, 4, 5, 5, 5, 5] },
    ],
  },
  {
    slug: "r", name: "Rare", code: "R", subtitle: "Core rare cards forming the backbone of decks",
    color: "#4F8EF7", colorD: "rgba(79,142,247,0.14)", colorBd: "rgba(79,142,247,0.3)",
    indexValue: 2840, cardCount: 320, avgCardPrice: 8.88, chg7d: 0.6, chg30d: 2.4, up: true,
    spark: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    topCards: [
      { name: "Luffy R", set: "OP01", rarity: "R", tcg: 8, avg: 9, chg1d: 0.4, chg7d: 1.2, chg30d: 4, spark: [4, 4, 4, 4, 4, 4, 4, 5, 5] },
      { name: "Zoro R", set: "OP02", rarity: "R", tcg: 6, avg: 7, chg1d: 0.2, chg7d: 0.8, chg30d: 2, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Nami R", set: "OP05", rarity: "R", tcg: 5, avg: 6, chg1d: -0.1, chg7d: 0.4, chg30d: 1, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Sanji R", set: "OP09", rarity: "R", tcg: 4, avg: 5, chg1d: 0.1, chg7d: 0.2, chg30d: 0.5, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Robin R", set: "OP14", rarity: "R", tcg: 3, avg: 4, chg1d: 0.2, chg7d: 0.6, chg30d: 2, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
    ],
  },
  {
    slug: "uc", name: "Uncommon", code: "UC", subtitle: "Mid-tier uncommons with steady utility",
    color: "#7A88A8", colorD: "rgba(122,136,168,0.12)", colorBd: "rgba(122,136,168,0.25)",
    indexValue: 860, cardCount: 480, avgCardPrice: 1.79, chg7d: 0.2, chg30d: 0.8, up: true,
    spark: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    topCards: [
      { name: "Luffy UC", set: "OP01", rarity: "UC", tcg: 2, avg: 2, chg1d: 0.1, chg7d: 0.2, chg30d: 0.4, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Zoro UC", set: "OP02", rarity: "UC", tcg: 1.5, avg: 2, chg1d: 0, chg7d: 0.1, chg30d: 0.2, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Nami UC", set: "OP05", rarity: "UC", tcg: 1, avg: 1.5, chg1d: 0, chg7d: 0, chg30d: 0.1, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
    ],
  },
  {
    slug: "c", name: "Common", code: "C", subtitle: "Bulk commons — high supply, low individual value",
    color: "#555E6E", colorD: "rgba(85,94,110,0.12)", colorBd: "rgba(85,94,110,0.25)",
    indexValue: 420, cardCount: 640, avgCardPrice: 0.66, chg7d: 0.1, chg30d: 0.2, up: true,
    spark: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    topCards: [
      { name: "Luffy C", set: "OP01", rarity: "C", tcg: 0.5, avg: 0.5, chg1d: 0, chg7d: 0, chg30d: 0.1, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Zoro C", set: "OP02", rarity: "C", tcg: 0.4, avg: 0.5, chg1d: 0, chg7d: 0, chg30d: 0, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
      { name: "Nami C", set: "OP05", rarity: "C", tcg: 0.3, avg: 0.4, chg1d: 0, chg7d: 0, chg30d: 0, spark: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
    ],
  },
];
