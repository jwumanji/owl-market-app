// ---------------------------------------------------------------------------
// Yuyu-tei One Piece parser.
//
// A set page (https://yuyu-tei.jp/sell/opc/s/{code}) is static HTML:
//   - a grid of `.card-product` units (one per card: number, name, rarity,
//     price, image, stable id) — see parseYuyuteiListing.
//   - the full set list as <input name="vers[]" value="{code}"> checkboxes —
//     see parseYuyuteiSetList (used for per-run set auto-discovery).
// ---------------------------------------------------------------------------

export interface YuyuteiRow {
  sourceCardId: string; // "op05/10143"
  sourceUrl: string;
  cardNumber: string; // "OP05-118"
  name: string; // "カイドウ(パラレル)"
  rarity: string; // Yuyu-tei rarity code, e.g. "P-SEC"
  variant: string; // our variant key: "altart" | "sp" | "manga" | "superparallel" | "signed" | "" (base)
  variantLabel: string; // human label for a JP-exclusive card row, e.g. "Super Parallel"
  jpExclusive: boolean; // true → never a variant of an EN card; gets its own region='jp' row
  priceJpy: number | null;
  inStock: boolean;
  imageUrl: string | null;
}

const YUYUTEI_SELL_BASE = "https://yuyu-tei.jp/sell/opc";

/** Set list-page URL for a One Piece set code (case-insensitive). */
export function yuyuteiSetUrl(setCode: string): string {
  return `${YUYUTEI_SELL_BASE}/s/${setCode.trim().toLowerCase()}`;
}

/** A card number like OP05-119 / ST01-012 / P-001 (not "-" or empty). */
export function isValidCardNumber(num: string | null | undefined): boolean {
  return /^[A-Z0-9]{1,6}-\d{1,4}$/.test((num ?? "").trim().toUpperCase());
}

/** Base rarity from a Yuyu-tei code: "P-SEC" → "SEC", "SP" → "SP". */
export function jpRarityBase(rarity: string | null | undefined): string {
  return (rarity ?? "").trim().toUpperCase().replace(/^P-/, "");
}

export interface JpVariant {
  variant: string;
  jpExclusive: boolean;
  variantLabel: string;
}

/**
 * Classify a Yuyu-tei row's variant against our card variant-key space.
 *   Signed (サイン入り) / Super Parallel (スーパーパラレル) → JP-EXCLUSIVE — these
 *     have no EN equivalent, so they must become their own region='jp' rows,
 *     NOT prices on the EN parallel.
 *   Parallel (パラレル / "P-…") → "altart" (matches EN alt-art).
 *   Comic (コミック) → "manga".  SP rarity → "sp".  else base ("").
 */
export function classifyYuyuteiVariant(rarity: string, name: string): JpVariant {
  const r = (rarity || "").toUpperCase().trim();
  const n = name || "";
  if (n.includes("サイン")) return { variant: "signed", jpExclusive: true, variantLabel: "Signed" };
  if (n.includes("スーパーパラレル")) return { variant: "superparallel", jpExclusive: true, variantLabel: "Super Parallel" };
  if (n.includes("コミック")) return { variant: "manga", jpExclusive: false, variantLabel: "Manga" };
  if (n.includes("パラレル") || r.startsWith("P-")) return { variant: "altart", jpExclusive: false, variantLabel: "Parallel" };
  if (r === "SP" || r.startsWith("SP")) return { variant: "sp", jpExclusive: false, variantLabel: "SP" };
  return { variant: "", jpExclusive: false, variantLabel: "" };
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

/**
 * Discover the full set list from any set page's vers[] checkboxes. Returns
 * sorted lowercase codes (op01, eb01, prb01, st01, …) — the auto-discovery
 * source, so new sets appear as Yuyu-tei adds them.
 */
export function parseYuyuteiSetList(html: string): string[] {
  const codes = new Set<string>();
  const re = /name="vers\[\]"[^>]*?value="([a-z0-9]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    codes.add(m[1].toLowerCase());
  }
  return Array.from(codes).sort();
}

const UNIT_DELIMITER = "card-product position-relative";

export function parseYuyuteiListing(html: string): YuyuteiRow[] {
  const units = html.split(UNIT_DELIMITER);
  const rows: YuyuteiRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < units.length; i++) {
    const chunk = units[i];
    const unit = chunk.slice(0, 4000);

    const idMatch = unit.match(/\/sell\/opc\/card\/([a-z0-9]+)\/(\d+)/i);
    if (!idMatch) continue;
    const [ver, cid] = [idMatch[1], idMatch[2]];
    const sourceCardId = `${ver}/${cid}`;
    if (seen.has(sourceCardId)) continue;

    const imgTag = unit.match(/<img[^>]*class="card img-fluid"[^>]*\/?>/i)?.[0] ?? "";
    const alt = decodeEntities((imgTag.match(/alt="([^"]*)"/) || [])[1] ?? "");
    const imageUrl = (imgTag.match(/src="([^"]*)"/) || [])[1] ?? null;
    const altParts = alt.split(" ").filter(Boolean);

    const numSpan = unit.match(/border border-dark[^>]*>\s*([A-Z0-9]+-[0-9]+)\s*</i);
    const cardNumber = (numSpan?.[1] || altParts[0] || "").toUpperCase();
    if (!cardNumber) continue;

    const rarity = altParts[1] ?? "";
    const h4 = unit.match(/<h4[^>]*>\s*([^<]+?)\s*<\/h4>/i);
    const name = decodeEntities(h4?.[1] || altParts.slice(2).join(" ") || "");

    const priceMatch = unit.match(/([\d,]+)\s*円/);
    const priceJpy = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;

    const inStock = !/sold-out/i.test(chunk.slice(0, 80));

    const cls = classifyYuyuteiVariant(rarity, name);

    seen.add(sourceCardId);
    rows.push({
      sourceCardId,
      sourceUrl: `https://yuyu-tei.jp/sell/opc/card/${ver}/${cid}`,
      cardNumber,
      name,
      rarity,
      variant: cls.variant,
      variantLabel: cls.variantLabel,
      jpExclusive: cls.jpExclusive,
      priceJpy,
      inStock,
      imageUrl,
    });
  }

  return rows;
}
