// ---------------------------------------------------------------------------
// Yuyu-tei One Piece singles parser.
//
// A set page (https://yuyu-tei.jp/sell/opc/s/{code}) is static HTML: a grid of
// `.card-product` units. Each unit carries everything we need:
//   - detail URL  /sell/opc/card/{ver}/{cid}         → stable source id
//   - card <img> alt "OP05-118 P-SEC カイドウ(パラレル)" → number + rarity + name + variant
//   - <span class="…border border-dark…">OP05-118</span>  → card number (authoritative)
//   - <strong>… 980 円</strong>                       → price (JPY)
//   - container class "…sold-out"                     → stock flag
// We split on the unit boundary and run scoped regexes per unit.
// ---------------------------------------------------------------------------

export interface YuyuteiRow {
  sourceCardId: string; // "op05/10143"
  sourceUrl: string;
  cardNumber: string; // "OP05-118"
  name: string; // "カイドウ(パラレル)"
  rarity: string; // "P-SEC"
  variant: string; // normalized key: "altart" | "sp" | "manga" | "" (base)
  priceJpy: number | null;
  inStock: boolean;
  imageUrl: string | null;
}

const YUYUTEI_SELL_BASE = "https://yuyu-tei.jp/sell/opc";

/** Set list-page URL for a One Piece set code (case-insensitive). */
export function yuyuteiSetUrl(setCode: string): string {
  return `${YUYUTEI_SELL_BASE}/s/${setCode.trim().toLowerCase()}`;
}

/**
 * Map Yuyu-tei's rarity code + JP name to our card variant-key space (the same
 * keys the JustTCG matcher uses: "altart" | "sp" | "manga" | "" for base).
 *   パラレル / スーパーパラレル / "P-…" rarity → altart (parallel = our alt-art)
 *   コミック                                    → manga
 *   SP rarity                                   → sp
 */
export function yuyuteiVariantKey(rarity: string, name: string): string {
  const r = (rarity || "").toUpperCase().trim();
  const n = name || "";
  if (n.includes("コミック")) return "manga";
  if (n.includes("パラレル") || r.startsWith("P-") || r === "P") return "altart";
  if (r === "SP" || r.startsWith("SP")) return "sp";
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNIT_DELIMITER = "card-product position-relative";

export function parseYuyuteiListing(html: string): YuyuteiRow[] {
  const units = html.split(UNIT_DELIMITER);
  const rows: YuyuteiRow[] = [];
  const seen = new Set<string>();

  // units[0] is the pre-grid preamble; each subsequent chunk starts a card.
  for (let i = 1; i < units.length; i++) {
    const chunk = units[i];
    const unit = chunk.slice(0, 4000); // one card's worth of markup

    // Stable source id + detail URL: /sell/opc/card/{ver}/{cid}
    const idMatch = unit.match(/\/sell\/opc\/card\/([a-z0-9]+)\/(\d+)/i);
    if (!idMatch) continue;
    const [ver, cid] = [idMatch[1], idMatch[2]];
    const sourceCardId = `${ver}/${cid}`;
    if (seen.has(sourceCardId)) continue;

    // Card image tag → alt ("OP05-118 P-SEC カイドウ(パラレル)") + src.
    const imgTag = unit.match(/<img[^>]*class="card img-fluid"[^>]*\/?>/i)?.[0] ?? "";
    const alt = decodeEntities((imgTag.match(/alt="([^"]*)"/) || [])[1] ?? "");
    const imageUrl = (imgTag.match(/src="([^"]*)"/) || [])[1] ?? null;
    const altParts = alt.split(" ").filter(Boolean);

    // Card number: prefer the dedicated bordered span; fall back to alt[0].
    const numSpan = unit.match(/border border-dark[^>]*>\s*([A-Z0-9]+-[0-9]+)\s*</i);
    const cardNumber = (numSpan?.[1] || altParts[0] || "").toUpperCase();
    if (!cardNumber) continue;

    // Rarity code = alt[1]; name from <h4>, else alt remainder.
    const rarity = altParts[1] ?? "";
    const h4 = unit.match(/<h4[^>]*>\s*([^<]+?)\s*<\/h4>/i);
    const name = decodeEntities(h4?.[1] || altParts.slice(2).join(" ") || "");

    // Price: first "… 円".
    const priceMatch = unit.match(/([\d,]+)\s*円/);
    const priceJpy = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;

    // Stock: the unit's opening class chunk includes "sold-out" when out.
    const inStock = !/sold-out/i.test(chunk.slice(0, 80));

    seen.add(sourceCardId);
    rows.push({
      sourceCardId,
      sourceUrl: `https://yuyu-tei.jp/sell/opc/card/${ver}/${cid}`,
      cardNumber,
      name,
      rarity,
      variant: yuyuteiVariantKey(rarity, name),
      priceJpy,
      inStock,
      imageUrl,
    });
  }

  return rows;
}
