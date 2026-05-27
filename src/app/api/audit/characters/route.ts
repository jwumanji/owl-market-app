import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
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
// GET /api/audit/characters — diagnostic report of character-card matching
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // 1. Fetch all characters
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, name, slug, aliases")
    .eq("game_id", game.id)
    .order("name");

  if (charErr) {
    return NextResponse.json({ error: charErr.message }, { status: 500 });
  }

  // 2. Build flat pattern list (name + aliases), longest first
  type MatchPattern = { characterId: string; characterName: string; pattern: string };
  const patterns: MatchPattern[] = [];

  for (const char of characters ?? []) {
    patterns.push({ characterId: char.id, characterName: char.name, pattern: char.name });
    for (const alias of char.aliases ?? []) {
      patterns.push({ characterId: char.id, characterName: char.name, pattern: alias });
    }
  }
  patterns.sort((a, b) => b.pattern.length - a.pattern.length);

  // 3. Fetch ALL cards (paginated)
  const allCards: { id: string; name: string; name_base: string | null; character_id: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data: batch, error: cardsErr } = await supabase
      .from("cards")
      .select("id, name, name_base, character_id")
      .eq("game_id", game.id)
      .range(from, from + pageSize - 1);

    if (cardsErr) {
      return NextResponse.json({ error: cardsErr.message }, { status: 500 });
    }
    if (!batch || batch.length === 0) break;
    allCards.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  // 4. Run matching in memory
  const matched: { cardName: string; character: string; pattern: string; cardId: string }[] = [];
  const unmatched: { name: string; name_base: string | null }[] = [];

  for (const card of allCards) {
    const cardName = (card.name_base || card.name || "").toLowerCase();
    if (!cardName) {
      unmatched.push({ name: card.name, name_base: card.name_base });
      continue;
    }

    let found = false;
    for (const pat of patterns) {
      if (nameMatchesCard(pat.pattern, cardName)) {
        matched.push({
          cardName: card.name_base || card.name,
          character: pat.characterName,
          pattern: pat.pattern,
          cardId: card.id,
        });
        found = true;
        break;
      }
    }

    if (!found) {
      unmatched.push({ name: card.name, name_base: card.name_base });
    }
  }

  // 5. Per-character breakdown
  const charMap = new Map<string, { name: string; count: number; samples: string[]; patterns: Set<string> }>();
  for (const m of matched) {
    const entry = charMap.get(m.character) ?? { name: m.character, count: 0, samples: [], patterns: new Set() };
    entry.count++;
    entry.patterns.add(m.pattern);
    if (entry.samples.length < 5) entry.samples.push(m.cardName);
    charMap.set(m.character, entry);
  }

  const characterBreakdown = Array.from(charMap.values())
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      name: c.name,
      card_count: c.count,
      matched_via: Array.from(c.patterns),
      sample_cards: c.samples,
    }));

  // 6. False positive flags (short patterns <= 4 chars)
  const falsePositiveFlags = matched
    .filter((m) => m.pattern.length <= 4)
    .slice(0, 50)
    .map((m) => ({
      card_name: m.cardName,
      matched_character: m.character,
      matched_pattern: m.pattern,
    }));

  // 7. Unmatched frequency analysis — extract first 1-3 words, count occurrences
  const freqMap = new Map<string, number>();
  for (const u of unmatched) {
    const base = (u.name_base || u.name || "").trim();
    if (!base) continue;

    const words = base.split(/\s+/);
    // Try 3-word, 2-word, and 1-word prefixes
    for (const len of [3, 2, 1]) {
      if (words.length >= len) {
        const prefix = words.slice(0, len).join(" ");
        freqMap.set(prefix, (freqMap.get(prefix) ?? 0) + 1);
      }
    }
  }

  const unmatchedFrequency = Array.from(freqMap.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([prefix, count]) => ({ prefix, count }));

  // 8. Compare with current DB tagging
  const currentlyTagged = allCards.filter((c) => c.character_id !== null).length;
  const wouldBeTagged = matched.length;

  return NextResponse.json({
    game: gameResponsePayload(game),
    summary: {
      total_cards: allCards.length,
      currently_tagged_in_db: currentlyTagged,
      would_match_with_new_logic: wouldBeTagged,
      unmatched: unmatched.length,
      characters_with_matches: charMap.size,
      characters_without_matches: (characters?.length ?? 0) - charMap.size,
    },
    character_breakdown: characterBreakdown,
    false_positive_flags: falsePositiveFlags,
    unmatched_frequency: unmatchedFrequency,
    unmatched_sample: unmatched.slice(0, 50).map((u) => u.name_base || u.name),
  });
}
