import type { SetData } from "./sets-data";

export type PromoCollectionKind = "anniversary" | "collection" | "special";

export interface PromoCollectionCatalogEntry {
  slug: string;
  code: string;
  name: string;
  year: number | null;
  type: PromoCollectionKind;
  language: string;
  cardCount?: number;
  officialUrl: string;
  comingSoon?: boolean;
}

// Product-level promotional releases from Bandai's English, Asia-English, and
// Simplified Chinese catalogs. Loose campaign, tournament, and event cards stay
// in the database-backed P / Organized Play / Judge groupings.
export const PROMO_COLLECTION_CATALOG: PromoCollectionCatalogEntry[] = [
  // Anniversary sets. Regional/language products are intentionally separate.
  { slug: "anniversary-japanese-1st", code: "ANN-JP-01", name: "1st Anniversary Set", year: 2023, type: "anniversary", language: "Japanese", cardCount: 3, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/anniversaryset1st.php" },
  { slug: "anniversary-japanese-1st-english", code: "ANN-JPEN-01", name: "Japanese 1st Anniversary Set", year: 2024, type: "anniversary", language: "English", cardCount: 3, officialUrl: "https://en.onepiece-cardgame.com/products/other/goods_set_1st-anniversary.php" },
  { slug: "anniversary-english-1st", code: "ANN-EN-01", name: "English Version 1st Anniversary Set", year: 2024, type: "anniversary", language: "English", cardCount: 10, officialUrl: "https://en.onepiece-cardgame.com/products/other/1st_anniversary_set.php" },
  { slug: "anniversary-china-1st", code: "ANN-CN-01", name: "China 1st Anniversary Set", year: 2024, type: "anniversary", language: "Simplified Chinese", cardCount: 6, officialUrl: "https://www.onepiece-cardgame.cn/" },
  { slug: "anniversary-japanese-2nd", code: "ANN-JP-02", name: "Japanese 2nd Anniversary Set", year: 2025, type: "anniversary", language: "Japanese", cardCount: 9, officialUrl: "https://en.onepiece-cardgame.com/products/other/goods_set_2nd-anniversary.php" },
  { slug: "anniversary-english-2nd", code: "ANN-EN-02", name: "English Version 2nd Anniversary Set", year: 2025, type: "anniversary", language: "English", cardCount: 18, officialUrl: "https://en.onepiece-cardgame.com/products/other/2nd_anniversary_set.php" },
  { slug: "anniversary-china-2nd", code: "ANN-CN-02", name: "China 2nd Anniversary Set", year: 2025, type: "anniversary", language: "Simplified Chinese", cardCount: 21, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/anniversaryset2nd-cn.php" },
  { slug: "anniversary-japanese-3rd", code: "ANN-JP-03", name: "Japanese 3rd Anniversary Set", year: 2026, type: "anniversary", language: "Japanese", cardCount: 20, officialUrl: "https://en.onepiece-cardgame.com/products/other/anniversaryset3rd.php" },
  { slug: "anniversary-english-3rd", code: "ANN-EN-03", name: "English Version 3rd Anniversary Set", year: 2026, type: "anniversary", language: "English", cardCount: 17, officialUrl: "https://en.onepiece-cardgame.com/products/other/3rd_anniversary_set.php", comingSoon: true },
  { slug: "anniversary-china-3rd", code: "ANN-CN-03", name: "Chinese Version 3rd Anniversary Set", year: 2026, type: "anniversary", language: "Simplified Chinese", officialUrl: "https://en.onepiece-cardgame.com/products/3rd_anniversary_set_cn.html" },
  { slug: "anniversary-china-4th", code: "ANN-CN-04", name: "China 4th Anniversary Commemorative Set", year: 2026, type: "anniversary", language: "Simplified Chinese", cardCount: 22, officialUrl: "https://www.onepiece-cardgame.cn/", comingSoon: true },

  // Premium Card Collections and booklet/folder-style releases.
  { slug: "pcc-25th-anniversary", code: "PCC-25", name: "Premium Card Collection 25th Anniversary Edition", year: 2023, type: "collection", language: "Japanese / English", cardCount: 10, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection25th.php" },
  { slug: "pcc-film-red", code: "PCC-FR", name: "Premium Card Collection -ONE PIECE FILM RED-", year: 2023, type: "collection", language: "Japanese / English", cardCount: 12, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/premium-card_collection.php" },
  { slug: "pcc-best-selection-1", code: "PCC-BS01", name: "Premium Card Collection -Best Selection Vol.1-", year: 2024, type: "collection", language: "Japanese / English", cardCount: 12, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection.php" },
  { slug: "pcc-live-action", code: "PCC-LA01", name: "Premium Card Collection -Live Action Edition-", year: 2024, type: "collection", language: "Japanese / English", cardCount: 9, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_liveaction.php" },
  { slug: "pcc-uta", code: "PCC-UTA", name: "Premium Card Collection -UTA-", year: 2023, type: "collection", language: "Japanese / English", cardCount: 6, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_uta.php" },
  { slug: "pcc-bcg-fest-23-24", code: "PCC-BCG23", name: "Premium Card Collection -BANDAI CARD GAMES Fest. 23-24 Edition-", year: 2024, type: "collection", language: "English", cardCount: 12, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php" },
  { slug: "pcc-girls", code: "PCC-GIRLS", name: "Premium Card Collection -Girls Edition-", year: 2024, type: "collection", language: "Japanese / English", cardCount: 6, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/premium-card_collection-girls.php" },
  { slug: "pcc-best-selection-2", code: "PCC-BS02", name: "Premium Card Collection -Best Selection Vol.2-", year: 2024, type: "collection", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection_vol2.php" },
  { slug: "pcc-best-selection-3", code: "PCC-BS03", name: "Premium Card Collection -Best Selection Vol.3-", year: 2024, type: "collection", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection_vol3.php" },
  { slug: "pcc-one-piece-day-24", code: "PCC-OPD24", name: "Premium Card Collection -ONE PIECE DAY '24-", year: 2024, type: "collection", language: "Japanese / English", cardCount: 2, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/premium-card_collection_op-day24.php" },
  { slug: "pcc-leader", code: "PCC-LDR", name: "Premium Card Collection -Leader Collection-", year: 2024, type: "collection", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_leader.php" },
  { slug: "pcc-best-selection-4", code: "PCC-BS04", name: "Premium Card Collection -Best Selection Vol.4-", year: 2025, type: "collection", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection_vol4.php" },
  { slug: "pcc-six-assort-1", code: "PCC-6A01", name: "Premium Card Collection -6 Assort Vol.1-", year: 2025, type: "collection", language: "Japanese / English", cardCount: 6, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_6assort.php" },
  { slug: "pcc-best-selection-5", code: "PCC-BS05", name: "Premium Card Collection -Best Selection Vol.5-", year: 2025, type: "collection", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection_vol5.php" },
  { slug: "pcc-one-piece-day-25", code: "PCC-OPD25", name: "Premium Card Collection -ONE PIECE DAY '25-", year: 2025, type: "collection", language: "Japanese / English", cardCount: 2, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/premium-card_collection_op-day25.php" },
  { slug: "pcc-best-selection-6", code: "PCC-BS06", name: "Premium Card Collection -Best Selection Vol.6-", year: 2026, type: "collection", language: "English", cardCount: 12, officialUrl: "https://en.onepiece-cardgame.com/products/other/cardcollection_bestselection_vol6.php", comingSoon: true },
  { slug: "pcc-best-selection-7", code: "PCC-BS07", name: "Premium Card Collection -Best Selection Vol.7-", year: 2026, type: "collection", language: "English", officialUrl: "https://en.onepiece-cardgame.com/products/card_collection_007.html", comingSoon: true },
  { slug: "pcc-live-action-straw-hat", code: "PCC-LA02-SH", name: "Premium Card Collection -Live Action Vol.2 Straw Hat Crew-", year: 2026, type: "collection", language: "English", officialUrl: "https://en.onepiece-cardgame.com/products/collection-drama002.html", comingSoon: true },
  { slug: "pcc-live-action-baroque", code: "PCC-LA02-BW", name: "Premium Card Collection -Live Action Vol.2 Baroque Works-", year: 2026, type: "collection", language: "English", officialUrl: "https://en.onepiece-cardgame.com/products/collection-drama003.html", comingSoon: true },
  { slug: "pcc-ace-sabo-luffy", code: "PCC-ASL", name: "Premium Card Collection -Ace/Sabo/Luffy-", year: 2026, type: "collection", language: "English", officialUrl: "https://en.onepiece-cardgame.com/products/card_collection_asl.html", comingSoon: true },
  { slug: "pcc-29th-anniversary", code: "PCC-29", name: "Premium Card Collection 29th Anniversary Edition", year: 2026, type: "collection", language: "English", officialUrl: "https://en.onepiece-cardgame.com/products/cardcollection29th.html", comingSoon: true },

  // Other official products whose contents explicitly include promo cards.
  { slug: "championship-2023-asl", code: "SP-CH23-ASL", name: "Championship Set 2023 -Ace/Sabo/Luffy-", year: 2023, type: "special", language: "Japanese / English", cardCount: 1, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/championshipset2023.php" },
  { slug: "championship-2023-emperors", code: "SP-CH23-4E", name: "Championship Set 2023 -Former Four Emperors-", year: 2023, type: "special", language: "Japanese / English", cardCount: 1, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/championshipset2023_02.php" },
  { slug: "special-goods-asl", code: "SP-GOODS-ASL", name: "Special Goods Set -Ace/Sabo/Luffy-", year: 2023, type: "special", language: "English", cardCount: 1, officialUrl: "https://en.onepiece-cardgame.com/products/other/goods_set_acesaboluffy.php" },
  { slug: "special-goods-emperors", code: "SP-GOODS-4E", name: "Special Goods Set -Former Four Emperors-", year: 2024, type: "special", language: "English", cardCount: 1, officialUrl: "https://en.onepiece-cardgame.com/products/other/goods_set_former_four_emperors.php" },
  { slug: "heroines-special", code: "SP-HEROINES", name: "ONE PIECE Heroines Special Set", year: 2025, type: "special", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/heroines-special.html" },
  { slug: "playmat-card-set-whole-cake", code: "SP-WCI", name: "Official Playmat & Card Set -Whole Cake Island Arc-", year: 2025, type: "special", language: "Japanese / English", officialUrl: "https://en.onepiece-cardgame.com/products/other/playmat009.php" },
  { slug: "treasure-chest-1", code: "SP-TC01", name: "Treasure Chest Vol.1", year: 2025, type: "special", language: "English (Asia)", cardCount: 3, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/tc01.php" },
  { slug: "admirable-collection-reiju", code: "AC-01", name: "Admirable Collection Vol.1 -Vinsmoke Reiju-", year: 2026, type: "special", language: "English (Asia)", cardCount: 4, officialUrl: "https://asia-en.onepiece-cardgame.com/products/other/ac01.php" },
  { slug: "illustration-box-1", code: "SP-IB01", name: "Illustration Box Vol.1", year: 2025, type: "special", language: "English (North America)", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib01.php" },
  { slug: "illustration-box-2", code: "SP-IB02", name: "Illustration Box Vol.2", year: 2025, type: "special", language: "English (North America)", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib02.php" },
  { slug: "illustration-box-ex", code: "SP-IBEX", name: "Illustration Box EX", year: 2025, type: "special", language: "English (North America)", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib-ex01.php" },
  { slug: "illustration-box-3", code: "SP-IB03", name: "Illustration Box Vol.3", year: 2025, type: "special", language: "English", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib03.php" },
  { slug: "illustration-box-4", code: "SP-IB04", name: "Illustration Box Vol.4", year: 2025, type: "special", language: "English", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib04.php" },
  { slug: "illustration-box-5", code: "SP-IB05", name: "Illustration Box Vol.5", year: 2026, type: "special", language: "English", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib05.php" },
  { slug: "illustration-box-6", code: "SP-IB06", name: "Illustration Box Vol.6", year: 2026, type: "special", language: "English", cardCount: 2, officialUrl: "https://en.onepiece-cardgame.com/products/other/ib06.php" },
];

const PROMO_COLORS: Record<PromoCollectionKind, string> = {
  anniversary: "#E8A020",
  collection: "#F472B6",
  special: "#4F8EF7",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function promoCollectionSets(): SetData[] {
  return PROMO_COLLECTION_CATALOG.map((entry) => {
    const color = PROMO_COLORS[entry.type];
    return {
      ...entry,
      color,
      colorD: hexToRgba(color, 0.14),
      colorBd: hexToRgba(color, 0.3),
      price: 0,
      chg7d: null,
      chg1d: null,
      chg30d: null,
      chgMax: 0,
      cards: 0,
      cardsTotal: entry.cardCount ?? 0,
      catalogCardCountKnown: entry.cardCount != null,
      volume: "catalog only",
      ath: "—",
      atl: "—",
      up: true,
      spark: [10, 10],
      perf: { h1: "—", h24: "—", d7: "—", m1: "—", y1: "—", max: "—" },
      perfUp: [true, true, true, true, true, true],
      topCards: [],
      pricingStatus: "catalog_only",
    };
  });
}
