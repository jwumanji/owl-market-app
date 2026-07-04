// ---------------------------------------------------------------------------
// Scrapingdog eBay sold-listings client
//
// Wraps Scrapingdog's eBay search endpoint. We ask Scrapingdog to render a
// completed/sold eBay search results page (LH_Sold=1&LH_Complete=1) and hand
// back the structured `search_results` array. One helper, one concern: fetch
// and normalize. Attribution to a specific card happens in the sync route.
// ---------------------------------------------------------------------------

const SCRAPINGDOG_ENDPOINT = "https://api.scrapingdog.com/ebay/search";
const EBAY_SEARCH_BASE = "https://www.ebay.com/sch/i.html";
const REQUEST_TIMEOUT_MS = 20_000;

export interface EbaySoldListing {
  itemId: string | null;
  title: string;
  extracted_price: number | null;
  link: string | null;
  image: string | null;
  condition: string | null;
  /** Raw sold-date string from Scrapingdog, e.g. "Sold Oct 12, 2024". */
  sold_date: string | null;
}

/** Coerce Scrapingdog's price field (number or "$1,234.56" string) to a number. */
function coercePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeResult(raw: any): EbaySoldListing {
  return {
    itemId: coerceId(raw?.itemId ?? raw?.id ?? raw?.item_id),
    title: typeof raw?.title === "string" ? raw.title : "",
    extracted_price: coercePrice(
      raw?.extracted_price ?? raw?.price ?? raw?.converted_price
    ),
    link: coerceId(raw?.link ?? raw?.url),
    image: coerceId(raw?.image ?? raw?.thumbnail ?? raw?.image_url),
    condition: coerceId(raw?.condition),
    sold_date: coerceId(raw?.sold_date ?? raw?.sold),
  };
}

/**
 * Fetch sold/completed eBay listings for a search query via Scrapingdog.
 *
 * @param query free-text eBay search (e.g. "Monkey D. Luffy OP01-024")
 * @returns normalized `search_results` rows. Empty array when the payload
 *          carries no results. Throws on a missing API key or an HTTP error so
 *          the caller can record and continue past a single bad card.
 */
export async function fetchSoldListings(query: string): Promise<EbaySoldListing[]> {
  const apiKey = process.env.SCRAPINGDOG_API_KEY;
  if (!apiKey) {
    throw new Error("SCRAPINGDOG_API_KEY is not set");
  }

  // Inner eBay URL: sold + completed listings for the query.
  const ebayUrl = new URL(EBAY_SEARCH_BASE);
  ebayUrl.searchParams.set("_nkw", query);
  ebayUrl.searchParams.set("LH_Sold", "1");
  ebayUrl.searchParams.set("LH_Complete", "1");

  // Outer Scrapingdog request. URLSearchParams encodes the eBay URL once for
  // transport; Scrapingdog decodes it back to the exact URL above.
  const endpoint = new URL(SCRAPINGDOG_ENDPOINT);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("url", ebayUrl.toString());

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Scrapingdog eBay ${response.status}: ${body.slice(0, 200) || response.statusText}`
    );
  }

  const data = await response.json().catch(() => null);
  const results = Array.isArray(data?.search_results) ? data.search_results : [];
  return results.map(normalizeResult);
}
