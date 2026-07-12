import { NextResponse } from "next/server";
import {
  buildCharacterMatchPatterns,
  findCardCharacterMatches,
} from "@/lib/character-card-matcher";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

type CardRow = {
  id: string;
  name: string | null;
  name_base: string | null;
  card_type: string | null;
  character_id: string | null;
};

async function fetchCards(supabase: ReturnType<typeof createServiceClient>, gameId: string) {
  const cards: CardRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, name, name_base, card_type, character_id")
      .eq("game_id", gameId)
      .eq("region", "en")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    cards.push(...(data as CardRow[]));
    if (data.length < pageSize) break;
  }
  return cards;
}

// GET /api/audit/characters
// Read-only reconciliation of every English card against the same matcher used
// by the production synchronizer.
export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
  });
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const { data: characters, error: characterError } = await supabase
    .from("characters")
    .select("id, name, slug, aliases")
    .eq("game_id", game.id)
    .order("name");
  if (characterError) return NextResponse.json({ error: characterError.message }, { status: 500 });

  try {
    const cards = await fetchCards(supabase, game.id);
    const characterRows = (characters ?? []).map((character) => ({
      id: character.id,
      name: character.name,
      aliases: (character.aliases as string[] | null) ?? [],
    }));
    const characterById = new Map(characterRows.map((character) => [character.id, character.name]));
    const patterns = buildCharacterMatchPatterns(characterRows);
    const predictedCounts = new Map<string, number>();
    const assignedCounts = new Map<string, number>();
    const missing: unknown[] = [];
    const conflicts: unknown[] = [];
    const assignedWithoutMatch: unknown[] = [];
    const ambiguous: unknown[] = [];
    const unmatchedCharacterNames = new Map<string, number>();

    for (const card of cards) {
      const matches = findCardCharacterMatches(card, patterns);
      const predicted = matches[0] ?? null;
      if (predicted) predictedCounts.set(predicted.characterId, (predictedCounts.get(predicted.characterId) ?? 0) + 1);
      if (card.character_id) assignedCounts.set(card.character_id, (assignedCounts.get(card.character_id) ?? 0) + 1);

      const cardName = card.name_base || card.name || "";
      if (predicted && !card.character_id) {
        missing.push({ card_id: card.id, card_name: cardName, predicted: characterById.get(predicted.characterId) });
      } else if (predicted && card.character_id !== predicted.characterId) {
        conflicts.push({
          card_id: card.id,
          card_name: cardName,
          assigned: characterById.get(card.character_id ?? "") ?? card.character_id,
          predicted: characterById.get(predicted.characterId),
        });
      } else if (!predicted && card.character_id) {
        assignedWithoutMatch.push({
          card_id: card.id,
          card_name: cardName,
          assigned: characterById.get(card.character_id) ?? card.character_id,
        });
      }

      if (matches.length > 1) {
        ambiguous.push({
          card_id: card.id,
          card_name: cardName,
          candidates: matches.map((match) => ({
            character: characterById.get(match.characterId) ?? match.characterId,
            pattern: match.matchedPattern,
          })),
        });
      }

      if (!predicted && /^(character|leader)$/i.test(card.card_type ?? "")) {
        unmatchedCharacterNames.set(cardName, (unmatchedCharacterNames.get(cardName) ?? 0) + 1);
      }
    }

    const perCharacter = characterRows.map((character) => ({
      id: character.id,
      name: character.name,
      assigned_cards: assignedCounts.get(character.id) ?? 0,
      predicted_cards: predictedCounts.get(character.id) ?? 0,
    }));

    return NextResponse.json({
      game: gameResponsePayload(game),
      summary: {
        characters: characterRows.length,
        english_cards: cards.length,
        assigned_cards: cards.filter((card) => card.character_id != null).length,
        missing_assignments: missing.length,
        conflicting_assignments: conflicts.length,
        assigned_without_name_match: assignedWithoutMatch.length,
        ambiguous_names: ambiguous.length,
        characters_without_cards: perCharacter.filter((character) => character.assigned_cards === 0).length,
        unmatched_character_or_leader_names: unmatchedCharacterNames.size,
      },
      missing_assignments: missing.slice(0, 100),
      conflicting_assignments: conflicts.slice(0, 100),
      assigned_without_name_match: assignedWithoutMatch.slice(0, 100),
      ambiguous_names: ambiguous.slice(0, 100),
      unmatched_character_or_leader_names: Array.from(unmatchedCharacterNames, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 200),
      per_character: perCharacter,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Character audit failed." },
      { status: 500 }
    );
  }
}
