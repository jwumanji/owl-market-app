// ---------------------------------------------------------------------------
// Scrapfly scrape client — returns a fetched page's HTML (result.content).
//
// Generic wrapper over https://api.scrapfly.io/scrape. Yuyu-tei serves the pop
// data as static HTML, so the default is a plain fetch; asp/render_js are opt-in
// for harder targets. Reads SCRAPFLY_API_KEY.
// ---------------------------------------------------------------------------

const SCRAPFLY_ENDPOINT = "https://api.scrapfly.io/scrape";
const REQUEST_TIMEOUT_MS = 60_000;

export interface ScrapflyOptions {
  /** Enable Anti-Scraping-Protection bypass (Cloudflare etc.). Costs more credits. */
  asp?: boolean;
  /** Render JavaScript (headless browser). Costs more credits. */
  renderJs?: boolean;
  /** ms to wait after load when render_js is on. */
  renderWaitMs?: number;
  /** Proxy country, e.g. "jp". */
  country?: string;
}

interface ScrapflyResult {
  content?: string;
  success?: boolean;
  status_code?: number;
  error?: unknown;
}

/**
 * Fetch a URL through Scrapfly and return the response body (HTML).
 * Throws on a missing key or any Scrapfly/target failure so the caller can
 * record it and continue past a single bad page.
 */
export async function fetchViaScrapfly(
  url: string,
  opts: ScrapflyOptions = {}
): Promise<string> {
  const key = process.env.SCRAPFLY_API_KEY;
  if (!key) throw new Error("SCRAPFLY_API_KEY is not set");

  const params = new URLSearchParams({ key, url });
  if (opts.asp) params.set("asp", "true");
  if (opts.renderJs) {
    params.set("render_js", "true");
    if (opts.renderWaitMs) params.set("rendering_wait", String(opts.renderWaitMs));
  }
  if (opts.country) params.set("country", opts.country);

  const res = await fetch(`${SCRAPFLY_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await res.json().catch(() => null)) as { result?: ScrapflyResult } | null;
  const result = data?.result;

  if (!res.ok || !result || result.success === false || !result.content) {
    const detail = result?.error
      ? JSON.stringify(result.error).slice(0, 200)
      : `HTTP ${res.status}`;
    throw new Error(`Scrapfly failed for ${url}: ${detail}`);
  }
  return result.content;
}
