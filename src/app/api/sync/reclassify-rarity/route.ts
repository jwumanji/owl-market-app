import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { JustTCG } from "justtcg-js";
import {
  ONE_PIECE_JUSTTCG_GAME_SLUG,
  buildJustTcgCodeToSlugs,
  classifyRarity,
  onePieceGame,
} from "@/lib/games/one-piece";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";

export const maxDuration = 60;

// Reverse map: internal code → all JustTCG set slugs.
// Some internal sets have multiple JustTCG aliases, especially PRB/promo
// collections, so using only the first slug leaves variants unvisited.
const CODE_TO_SLUGS = buildJustTcgCodeToSlugs(onePieceGame.justTcgSetSlugMap);

// ---------------------------------------------------------------------------
// GET /api/sync/reclassify-rarity
//
// Full scan: fetches JustTCG names for every set, matches to DB cards by
// card_number, and reclassifies rarity using the JustTCG name (which
// contains variant tags like (Manga), (SP), (TR), (Alternate Art), etc.)
//
// ?dry=1  → preview changes without applying
// ?set=OP05 → limit to a single set
// ---------------------------------------------------------------------------

interface DbCard {
  id: string;
  game_id: string;
  card_number: string | null;
  name: string;
  variant_label: string | null;
  rarity: string;
  set_id: string;
}

interface JTCard {
  name: string;
  number: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry") === "1";
  const setFilter = searchParams.get("set")?.toUpperCase();

  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;
  const client = new JustTCG();

  // 1. Fetch all DB sets
  const { data: dbSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, code")
    .eq("game_id", game.id)
    .order("code");

  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }

  const syncableSets = (dbSets ?? []).filter((s: { id: string; code: string }) => {
    if (!s.code || !CODE_TO_SLUGS[s.code]) return false;
    if (setFilter) return s.code === setFilter;
    return true;
  });

  // 2. For each set, fetch DB cards + JustTCG cards, match, reclassify
  const changes: { id: string; name: string; jtName: string; from: string; to: string; setCode: string }[] = [];
  const setResults: { code: string; cards: number; changed: number }[] = [];

  for (const dbSet of syncableSets) {
    const setCode = dbSet.code;
    const jtSlugs = CODE_TO_SLUGS[setCode] ?? [];

    // Fetch DB cards for this set
    const allDbCards: DbCard[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("cards")
        .select("id, game_id, card_number, name, variant_label, rarity, set_id")
        .eq("game_id", game.id)
        .eq("set_id", dbSet.id)
        .not("rarity", "is", null)
        .range(from, from + pageSize - 1);

      if (!page || page.length === 0) break;
      allDbCards.push(...(page as DbCard[]));
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // Build DB lookup by card_number
    const byNumber = new Map<string, DbCard[]>();
    for (const card of allDbCards) {
      if (card.card_number) {
        const arr = byNumber.get(card.card_number) ?? [];
        arr.push(card);
        byNumber.set(card.card_number, arr);
      }
    }

    // Fetch JustTCG cards for every slug mapped to this set.
    const jtCardsByKey = new Map<string, JTCard>();
    try {
      for (const jtSlug of jtSlugs) {
        let offset = 0;
        while (true) {
          const response = await client.v1.cards.get({
            game: ONE_PIECE_JUSTTCG_GAME_SLUG,
            set: jtSlug,
            include_null_prices: false,
            limit: 100,
            offset,
          });
          const cards = response.data ?? [];
          for (const c of cards) {
            const card = { name: c.name, number: c.number ?? null };
            jtCardsByKey.set(`${card.number ?? ""}|${card.name}`, card);
          }
          if (!response.pagination?.hasMore) break;
          offset += 100;
        }
      }
    } catch {
      // Skip sets that fail to fetch
      setResults.push({ code: setCode, cards: allDbCards.length, changed: 0 });
      continue;
    }

    const jtCards = Array.from(jtCardsByKey.values());

    // Match JustTCG → DB cards and reclassify
    let setChanged = 0;
    const matched = new Set<string>();

    for (const jtCard of jtCards) {
      if (!jtCard.number) continue;
      const dbCards = byNumber.get(jtCard.number);
      if (!dbCards || dbCards.length === 0) continue;

      // Filter out already-matched cards
      const unmatched = dbCards.filter((c) => !matched.has(c.id));
      if (unmatched.length === 0) continue;

      // Score by tag overlap (same logic as sync)
      const jtTags = extractTags(jtCard.name);

      const scored = unmatched.map((c) => {
        const dbTags = extractTags(`${c.name ?? ""} ${c.variant_label ?? ""}`);
        if (c.variant_label) {
          const vl = c.variant_label.toLowerCase();
          if (dbTags.indexOf(vl) < 0) dbTags.push(vl);
        }
        let matchingTags = 0;
        const totalTags = Math.max(jtTags.length, dbTags.length);
        for (const t of jtTags) {
          if (dbTags.indexOf(t) >= 0) matchingTags++;
        }
        if (totalTags === 0) return { card: c, score: 1 };
        return { card: c, score: totalTags - matchingTags };
      });

      scored.sort((a, b) => a.score - b.score);
      const best = scored[0];
      if (!best) continue;

      matched.add(best.card.id);

      // Classify using BOTH DB name and JustTCG name
      const fromDb = classifyRarity(
        best.card.name ?? "",
        best.card.variant_label ?? null,
        best.card.rarity
      );
      const fromJt = classifyRarity(
        jtCard.name,
        best.card.variant_label ?? null,
        best.card.rarity
      );
      const newRarity = fromDb !== best.card.rarity ? fromDb : fromJt;

      if (newRarity !== best.card.rarity) {
        changes.push({
          id: best.card.id,
          name: best.card.name,
          jtName: jtCard.name,
          from: best.card.rarity,
          to: newRarity,
          setCode,
        });
        setChanged++;
      }
    }

    setResults.push({ code: setCode, cards: allDbCards.length, changed: setChanged });
  }

  // Summary by rarity
  const bySummary: Record<string, number> = {};
  for (const c of changes) {
    const key = `${c.from} → ${c.to}`;
    bySummary[key] = (bySummary[key] ?? 0) + 1;
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      game: game.slug,
      provider: "justtcg",
      setsScanned: syncableSets.length,
      totalChanges: changes.length,
      summary: bySummary,
      sets: setResults.filter((s) => s.changed > 0),
      changes: changes.map((c) => `[${c.setCode}] ${c.name} (${c.jtName}): ${c.from} → ${c.to}`),
    });
  }

  // Apply changes in batches grouped by target rarity
  let updated = 0;
  const errors: string[] = [];

  const byRarity = new Map<string, string[]>();
  for (const c of changes) {
    const ids = byRarity.get(c.to) ?? [];
    ids.push(c.id);
    byRarity.set(c.to, ids);
  }

  for (const [rarity, ids] of Array.from(byRarity.entries())) {
    // Batch in groups of 100 to avoid query size limits
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { error: upErr } = await supabase
        .from("cards")
        .update({ rarity })
        .eq("game_id", game.id)
        .in("id", batch);

      if (upErr) {
        errors.push(`${rarity}: ${upErr.message}`);
      } else {
        updated += batch.length;
      }
    }
  }

  return NextResponse.json({
    game: game.slug,
    provider: "justtcg",
    setsScanned: syncableSets.length,
    updated,
    errors,
    summary: bySummary,
    sets: setResults.filter((s) => s.changed > 0),
    changes: changes.map((c) => `[${c.setCode}] ${c.name} (${c.jtName}): ${c.from} → ${c.to}`),
  });
}

// Extract variant tags from a name, stripping numeric-only tags
function extractTags(name: string): string[] {
  const tags: string[] = [];
  const re = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name.toLowerCase())) !== null) {
    const tag = m[1].trim();
    if (!/^\d+$/.test(tag)) tags.push(tag);
  }
  return tags;
}
