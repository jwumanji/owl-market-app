import { NextResponse } from "next/server";
import {
  cardImageHealthCandidates,
  classifyImageProbe,
  imageSourceProvider,
  selectImageHealthSample,
  type ImageHealthCard,
} from "@/lib/card-image-health";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 300;

const DEFAULT_PROBES_PER_GAME = 150;
const MAX_PROBES_PER_GAME = 500;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_TIMEOUT_MS = 10_000;
const PROBE_CONCURRENCY = 16;
const SOFT_DEADLINE_MS = 260_000;
const ISSUE_LIMIT = 100;

type GameRow = {
  id: string;
  slug: string;
  name: string;
};

type CardRow = ImageHealthCard & {
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  image_mirror_status: string | null;
  image_mirror_error: string | null;
};

type PriceRow = {
  card_id: string;
  tcg_market: number | string | null;
  market_avg: number | string | null;
};

type ExternalIdRow = {
  card_id: string;
  external_id: string;
};

type ImageIssue = {
  cardId: string;
  cardName: string;
  cardNumber: string | null;
  game: string;
  provider: string | null;
  reason: string;
  status: number | null;
  url: string | null;
};

type ProbeResult = {
  issue: ImageIssue | null;
  skipped: boolean;
};

function intParam(
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(searchParams.get(name) ?? "", 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function finitePrice(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function loadCards(supabase: ReturnType<typeof createServiceClient>, gameId: string) {
  const cards: CardRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("cards")
      .select(
        "id,card_image_id,card_number,name,image_url,image_url_small,image_url_preview,image_source_url,image_mirror_status,image_mirror_error"
      )
      .eq("game_id", gameId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Card image audit query failed: ${error.message}`);
    const page = (data ?? []) as CardRow[];
    cards.push(...page);
    if (page.length < 1000) return cards;
  }
}

async function loadPrices(supabase: ReturnType<typeof createServiceClient>, gameId: string) {
  const prices: PriceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("price_stats")
      .select("card_id,tcg_market,market_avg")
      .eq("game_id", gameId)
      .range(from, from + 999);
    if (error) throw new Error(`Card image price query failed: ${error.message}`);
    const page = (data ?? []) as PriceRow[];
    prices.push(...page);
    if (page.length < 1000) return prices;
  }
}

async function loadTcgplayerIds(
  supabase: ReturnType<typeof createServiceClient>,
  gameId: string,
) {
  const externalIds: ExternalIdRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("card_external_ids")
      .select("card_id,external_id")
      .eq("game_id", gameId)
      .eq("provider", "tcgplayer")
      .eq("external_type", "product_id")
      .range(from, from + 999);
    if (error) throw new Error(`Card image external ID query failed: ${error.message}`);
    const page = (data ?? []) as ExternalIdRow[];
    externalIds.push(...page);
    if (page.length < 1000) return externalIds;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
        "User-Agent": "MoonMarketImageHealth/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeImage(
  card: CardRow,
  game: GameRow,
  url: string,
  timeoutMs: number,
  deadlineAt: number,
): Promise<ProbeResult> {
  if (Date.now() >= deadlineAt) return { issue: null, skipped: true };

  try {
    let response = await fetchWithTimeout(url, timeoutMs, "HEAD");
    if ([403, 405, 501].includes(response.status)) {
      await response.body?.cancel();
      response = await fetchWithTimeout(url, timeoutMs, "GET");
    }
    const status = response.status;
    const classification = classifyImageProbe(status, response.headers.get("content-type"));
    await response.body?.cancel();
    if (classification.healthy) return { issue: null, skipped: false };

    return {
      skipped: false,
      issue: {
        game: game.slug,
        cardId: card.id,
        cardName: card.name,
        cardNumber: card.card_number,
        url,
        provider: imageSourceProvider(url),
        status,
        reason: classification.reason,
      },
    };
  } catch (error) {
    return {
      skipped: false,
      issue: {
        game: game.slug,
        cardId: card.id,
        cardName: card.name,
        cardNumber: card.card_number,
        url,
        provider: imageSourceProvider(url),
        status: null,
        reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
      },
    };
  }
}

async function runProbePool(
  tasks: Array<() => Promise<ProbeResult>>,
) {
  const results: ProbeResult[] = [];
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PROBE_CONCURRENCY, tasks.length) },
      () => worker(),
    ),
  );
  return results;
}

function statusCounts(cards: CardRow[]) {
  const counts: Record<string, number> = {};
  for (const card of cards) {
    const status = card.image_mirror_status ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request, { secretNames: ["CRON_SECRET"] });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = new Date();
  const deadlineAt = startedAt.getTime() + SOFT_DEADLINE_MS;
  const { searchParams } = new URL(request.url);
  const probesPerGame = intParam(
    searchParams,
    "limit",
    DEFAULT_PROBES_PER_GAME,
    20,
    MAX_PROBES_PER_GAME,
  );
  const timeoutMs = intParam(
    searchParams,
    "timeoutMs",
    DEFAULT_TIMEOUT_MS,
    1_000,
    MAX_TIMEOUT_MS,
  );
  const requestedGame = searchParams.get("game")?.trim() || null;
  const rotationSeed = Math.floor(startedAt.getTime() / 86_400_000);
  const supabase = createServiceClient();

  let gamesQuery = supabase
    .from("games")
    .select("id,slug,name")
    .eq("is_active", true)
    .order("slug");
  if (requestedGame) gamesQuery = gamesQuery.eq("slug", requestedGame);

  const { data: gameRows, error: gamesError } = await gamesQuery;
  if (gamesError) {
    return NextResponse.json(
      { error: `Card image game query failed: ${gamesError.message}` },
      { status: 500 },
    );
  }
  const games = (gameRows ?? []) as GameRow[];
  if (games.length === 0) {
    return NextResponse.json(
      { error: requestedGame ? `Active game '${requestedGame}' was not found` : "No active games found" },
      { status: 404 },
    );
  }

  const summaries = [];
  const issues: ImageIssue[] = [];
  let totalCards = 0;
  let totalProbed = 0;
  let totalBroken = 0;
  let totalMissingSources = 0;
  let totalMirrorErrors = 0;
  let totalSkipped = 0;

  for (const game of games) {
    try {
      const [cards, prices, externalIds] = await Promise.all([
        loadCards(supabase, game.id),
        loadPrices(supabase, game.id),
        loadTcgplayerIds(supabase, game.id),
      ]);
      const priceByCard = new Map(
        prices.map((row) => [
          row.card_id,
          finitePrice(row.tcg_market) || finitePrice(row.market_avg),
        ]),
      );
      const productIdByCard = new Map(
        externalIds.map((row) => [row.card_id, row.external_id]),
      );
      const candidatesByCard = new Map(
        cards.map((card) => [
          card.id,
          cardImageHealthCandidates(card, productIdByCard.get(card.id)),
        ]),
      );
      const missingSourceCards = cards.filter(
        (card) => (candidatesByCard.get(card.id)?.length ?? 0) === 0,
      );
      const mirrorErrorCards = cards.filter(
        (card) => card.image_mirror_status === "error",
      );
      const sample = selectImageHealthSample(
        cards.filter((card) => (candidatesByCard.get(card.id)?.length ?? 0) > 0),
        priceByCard,
        probesPerGame,
        rotationSeed,
      );
      const probeResults = await runProbePool(
        sample.map((card) => () => probeImage(
          card,
          game,
          candidatesByCard.get(card.id)?.[0] as string,
          timeoutMs,
          deadlineAt,
        )),
      );
      const probeIssues = probeResults
        .map((result) => result.issue)
        .filter((issue): issue is ImageIssue => issue != null);
      const skipped = probeResults.filter((result) => result.skipped).length;

      totalCards += cards.length;
      totalProbed += probeResults.length - skipped;
      totalBroken += probeIssues.length;
      totalMissingSources += missingSourceCards.length;
      totalMirrorErrors += mirrorErrorCards.length;
      totalSkipped += skipped;

      for (const card of mirrorErrorCards) {
        if (issues.length >= ISSUE_LIMIT) break;
        issues.push({
          game: game.slug,
          cardId: card.id,
          cardName: card.name,
          cardNumber: card.card_number,
          url: card.image_source_url ?? null,
          provider: card.image_source_url ? imageSourceProvider(card.image_source_url) : null,
          status: null,
          reason: card.image_mirror_error || "mirror_error",
        });
      }
      for (const issue of probeIssues) {
        if (issues.length >= ISSUE_LIMIT) break;
        issues.push(issue);
      }
      for (const card of missingSourceCards) {
        if (issues.length >= ISSUE_LIMIT) break;
        issues.push({
          game: game.slug,
          cardId: card.id,
          cardName: card.name,
          cardNumber: card.card_number,
          url: null,
          provider: null,
          status: null,
          reason: "missing_source",
        });
      }

      summaries.push({
        game: { id: game.id, slug: game.slug, name: game.name },
        cards: cards.length,
        mirrorStatuses: statusCounts(cards),
        missingSources: missingSourceCards.length,
        mirrorErrors: mirrorErrorCards.length,
        probes: {
          requested: sample.length,
          completed: probeResults.length - skipped,
          healthy: probeResults.length - skipped - probeIssues.length,
          broken: probeIssues.length,
          skipped,
        },
      });
    } catch (error) {
      summaries.push({
        game: { id: game.id, slug: game.slug, name: game.name },
        error: error instanceof Error ? error.message : "Unknown audit error",
      });
    }
  }

  const completedAt = new Date();
  const gameErrors = summaries.filter((summary) => "error" in summary).length;
  const healthy = (
    totalBroken === 0
    && totalMissingSources === 0
    && totalMirrorErrors === 0
    && gameErrors === 0
  );
  const auditRecord = {
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    scope: requestedGame ?? "all_active_games",
    healthy,
    game_count: games.length,
    card_count: totalCards,
    probed_count: totalProbed,
    broken_count: totalBroken,
    missing_source_count: totalMissingSources,
    mirror_error_count: totalMirrorErrors,
    skipped_count: totalSkipped,
    summaries,
    issues,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("card_image_health_audits")
    .insert(auditRecord)
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json(
      {
        error: `Card image audit persistence failed: ${insertError.message}`,
        audit: auditRecord,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: inserted.id,
    ...auditRecord,
    duration_ms: completedAt.getTime() - startedAt.getTime(),
  });
}
