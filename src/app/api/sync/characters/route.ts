import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// False-positive exclusions: pattern → phrases that should NOT match
// ---------------------------------------------------------------------------
const EXCLUSIONS: Record<string, string[]> = {
  roger: ["jolly roger"],
  king: ["king kong", "king pistol", "king punch", "king cobra", "king bazooka"],
  dragon: ["dragon twister", "dragon seal", "dragon claw", "dragon breath", "dragon damnation"],
};

// ---------------------------------------------------------------------------
// Word-boundary aware matching (prevents "Nami" matching "Tsunami" etc.)
// ---------------------------------------------------------------------------
function nameMatchesCard(pattern: string, cardName: string): boolean {
  const patLower = pattern.toLowerCase();
  const idx = cardName.indexOf(patLower);
  if (idx === -1) return false;

  // Left boundary: start of string or non-alphanumeric before match
  if (idx > 0 && /[a-z0-9]/i.test(cardName[idx - 1])) return false;

  // Right boundary: end of string or non-alphanumeric after match
  const end = idx + patLower.length;
  if (end < cardName.length && /[a-z0-9]/i.test(cardName[end])) return false;

  // Check exclusions
  const excl = EXCLUSIONS[patLower];
  if (excl && excl.some((phrase) => cardName.includes(phrase))) return false;

  return true;
}

// ---------------------------------------------------------------------------
// POST /api/sync/characters — backfill cards with character_id
// Matches card name/name_base against character names + aliases from the DB.
// Supports ?reset=true to clear all character_id values and re-run.
// Safe to run multiple times (idempotent).
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const reset = searchParams.get("reset") === "true";

  if (process.env.SYNC_SECRET && token !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // 0. If reset mode, clear all character_id values first
  if (reset) {
    const { error: resetErr } = await supabase
      .from("cards")
      .update({ character_id: null })
      .eq("game_id", game.id)
      .not("character_id", "is", null);

    if (resetErr) {
      return NextResponse.json({ error: `Reset failed: ${resetErr.message}` }, { status: 500 });
    }
  }

  // 1. Fetch all characters with aliases
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, name, slug, aliases")
    .eq("game_id", game.id)
    .order("name");

  if (charErr) {
    return NextResponse.json({ error: charErr.message }, { status: 500 });
  }

  if (!characters || characters.length === 0) {
    return NextResponse.json({ error: "No characters in DB. Run schema-migration-v5.sql first." }, { status: 400 });
  }

  // 2. Build flat pattern list from names + aliases, sorted longest-first
  type MatchPattern = { characterId: string; pattern: string };
  const patterns: MatchPattern[] = [];

  for (const char of characters) {
    patterns.push({ characterId: char.id, pattern: char.name });
    for (const alias of (char.aliases as string[]) ?? []) {
      patterns.push({ characterId: char.id, pattern: alias });
    }
  }
  patterns.sort((a, b) => b.pattern.length - a.pattern.length);

  // 3. Fetch ALL cards without character_id (paginate past 1000-row limit)
  const allCards: { id: string; name: string; name_base: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data: batch, error: cardsErr } = await supabase
      .from("cards")
      .select("id, name, name_base")
      .eq("game_id", game.id)
      .is("character_id", null)
      .range(from, from + pageSize - 1);

    if (cardsErr) {
      return NextResponse.json({ error: cardsErr.message }, { status: 500 });
    }

    if (!batch || batch.length === 0) break;
    allCards.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  if (allCards.length === 0) {
    return NextResponse.json({ message: "All cards already tagged", updated: 0 });
  }

  // 4. Match cards to characters using word-boundary matching
  const updates: { id: string; character_id: string }[] = [];

  for (const card of allCards) {
    const cardName = (card.name_base || card.name || "").toLowerCase();
    if (!cardName) continue;

    for (const pat of patterns) {
      if (nameMatchesCard(pat.pattern, cardName)) {
        updates.push({ id: card.id, character_id: pat.characterId });
        break; // first (longest) match wins
      }
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ message: "No matches found", updated: 0, total_cards: allCards.length });
  }

  // 5. Batch update in chunks of 500
  let updated = 0;
  const chunkSize = 500;

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);

    const promises = chunk.map((u) =>
      supabase
        .from("cards")
        .update({ character_id: u.character_id })
        .eq("game_id", game.id)
        .eq("id", u.id)
    );

    const results = await Promise.all(promises);
    updated += results.filter((r) => !r.error).length;
  }

  return NextResponse.json({
    message: reset ? "Reset + backfill complete" : "Backfill complete",
    game: gameResponsePayload(game),
    total_cards: allCards.length,
    matched: updates.length,
    updated,
    unmatched: allCards.length - updates.length,
  });
}

// Also support GET for easy browser triggering
export { POST as GET };
