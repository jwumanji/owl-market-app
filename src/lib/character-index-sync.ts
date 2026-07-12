import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCharacterMatchPatterns,
  cleanCharacterCardMatchName,
  findCardCharacterMatches,
  normalizeCharacterMatchText,
  splitCharacterCardNames,
} from "@/lib/character-card-matcher";
import {
  canonicalOnePieceCharacterIdentity,
  ONE_PIECE_CHARACTER_IDENTITIES,
} from "@/lib/one-piece-character-identities";

type GameScope = { id: string; slug: string };
type CharacterRow = {
  id: string;
  name: string;
  slug: string;
  aliases: string[] | null;
  created_at: string | null;
};
type CardRow = {
  id: string;
  name: string | null;
  name_base: string | null;
  card_type: string | null;
  character_id: string | null;
};

type QueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

async function fetchPaged<T>(load: (from: number, to: number) => QueryResult<T>, pageSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function buildExactCharacterIndex(characters: CharacterRow[]) {
  const index = new Map<string, string>();
  for (const character of characters) {
    for (const name of [character.name, ...(character.aliases ?? [])]) {
      const normalized = normalizeCharacterMatchText(name);
      if (normalized && !index.has(normalized)) index.set(normalized, character.id);
    }
  }
  return index;
}

function slugBase(name: string) {
  return normalizeCharacterMatchText(name).replace(/\s+/g, "-") || "character";
}

function uniqueSlug(name: string, gameSlug: string, used: Set<string>) {
  const base = slugBase(name);
  for (const candidate of [base, `${base}-${gameSlug}`]) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${gameSlug}-${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function mergeAliases(current: string[] | null, additions: Iterable<string>, canonicalName: string) {
  const canonical = normalizeCharacterMatchText(canonicalName);
  const aliases = new Map<string, string>();
  for (const alias of [...(current ?? []), ...additions]) {
    const normalized = normalizeCharacterMatchText(alias);
    if (normalized && normalized !== canonical && !aliases.has(normalized)) aliases.set(normalized, alias);
  }
  return Array.from(aliases.values());
}

export async function synchronizeCharacterIndex(
  supabase: SupabaseClient,
  game: GameScope
) {
  const [initialCharactersLoaded, cards, allCharacterSlugs] = await Promise.all([
    fetchPaged<CharacterRow>((from, to) =>
      supabase
        .from("characters")
        .select("id, name, slug, aliases, created_at")
        .eq("game_id", game.id)
        .order("name")
        .range(from, to)
    ),
    fetchPaged<CardRow>((from, to) =>
      supabase
        .from("cards")
        .select("id, name, name_base, card_type, character_id")
        .eq("game_id", game.id)
        .eq("region", "en")
        .order("id")
        .range(from, to)
    ),
    fetchPaged<{ slug: string }>((from, to) =>
      supabase.from("characters").select("slug").order("slug").range(from, to)
    ),
  ]);

  let initialCharacters = initialCharactersLoaded;
  let duplicateProfilesMerged = 0;
  let canonicalProfilesUpdated = 0;
  if (game.slug === "one_piece") {
    for (const identity of ONE_PIECE_CHARACTER_IDENTITIES) {
      const identityNames = new Set(
        [identity.canonicalName, ...identity.aliases].map(normalizeCharacterMatchText)
      );
      const profiles = initialCharacters
        .filter((character) => identityNames.has(normalizeCharacterMatchText(character.name)))
        .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""));
      if (!profiles.length) continue;

      const keeper = profiles[0];
      const duplicates = profiles.slice(1);
      if (duplicates.length) {
        const { error } = await supabase
          .from("characters")
          .delete()
          .eq("game_id", game.id)
          .in("id", duplicates.map((character) => character.id));
        if (error) throw new Error(`Duplicate identity cleanup failed: ${error.message}`);
        duplicateProfilesMerged += duplicates.length;
      }

      const aliases = mergeAliases(
        keeper.aliases,
        [...identity.aliases, ...profiles.flatMap((character) => [character.name, ...(character.aliases ?? [])])],
        identity.canonicalName
      );
      if (keeper.name !== identity.canonicalName || JSON.stringify(aliases) !== JSON.stringify(keeper.aliases ?? [])) {
        const { error } = await supabase
          .from("characters")
          .update({ name: identity.canonicalName, aliases })
          .eq("id", keeper.id);
        if (error) throw new Error(`Canonical identity update failed: ${error.message}`);
        canonicalProfilesUpdated += 1;
      }
    }

    if (duplicateProfilesMerged || canonicalProfilesUpdated) {
      initialCharacters = await fetchPaged<CharacterRow>((from, to) =>
        supabase
          .from("characters")
          .select("id, name, slug, aliases, created_at")
          .eq("game_id", game.id)
          .order("name")
          .range(from, to)
      );
    }
  }

  const initialExactIndex = buildExactCharacterIndex(initialCharacters);
  const characterById = new Map(initialCharacters.map((character) => [character.id, character]));
  const aliasesByCharacterId = new Map<string, Set<string>>();
  const profileCandidates = new Map<
    string,
    { name: string; aliases: Set<string>; cardTypes: Set<string> }
  >();

  function collectProfile(name: string, cardType = "Character") {
    const identity = game.slug === "one_piece"
      ? canonicalOnePieceCharacterIdentity(name)
      : { canonicalName: name, aliases: [] as string[] };
    const canonicalKey = normalizeCharacterMatchText(identity.canonicalName);
    if (!canonicalKey) return;

    const existingId = initialExactIndex.get(canonicalKey);
    const additions = new Set([...identity.aliases, name]);
    if (existingId) {
      const aliases = aliasesByCharacterId.get(existingId) ?? new Set<string>();
      for (const alias of additions) aliases.add(alias);
      aliasesByCharacterId.set(existingId, aliases);
      return;
    }

    const candidate = profileCandidates.get(canonicalKey) ?? {
      name: identity.canonicalName,
      aliases: new Set<string>(),
      cardTypes: new Set<string>(),
    };
    for (const alias of additions) candidate.aliases.add(alias);
    candidate.cardTypes.add(cardType);
    profileCandidates.set(canonicalKey, candidate);
  }

  if (game.slug === "one_piece") {
    for (const identity of ONE_PIECE_CHARACTER_IDENTITIES) {
      collectProfile(identity.canonicalName);
      for (const alias of identity.aliases) collectProfile(alias);
    }
  }

  for (const card of cards) {
    if (!/^(character|leader)$/i.test(card.card_type ?? "")) continue;
    const printedName = cleanCharacterCardMatchName(card.name_base?.trim() || card.name);
    for (const part of splitCharacterCardNames(printedName)) collectProfile(part, card.card_type ?? "Character");
  }

  let aliasesUpdated = 0;
  for (const [characterId, additions] of aliasesByCharacterId) {
    const character = characterById.get(characterId);
    if (!character) continue;
    const aliases = mergeAliases(character.aliases, additions, character.name);
    if (JSON.stringify(aliases) === JSON.stringify(character.aliases ?? [])) continue;
    const { error } = await supabase.from("characters").update({ aliases }).eq("id", characterId);
    if (error) throw new Error(`Alias update failed for ${character.name}: ${error.message}`);
    aliasesUpdated += 1;
  }

  const usedSlugs = new Set(allCharacterSlugs.map((row) => row.slug));
  const newProfiles = Array.from(profileCandidates.values()).map((candidate) => ({
    game_id: game.id,
    slug: uniqueSlug(candidate.name, game.slug, usedSlugs),
    name: candidate.name,
    aliases: mergeAliases(null, candidate.aliases, candidate.name),
    subtitle: "",
    faction: "",
    tier: 3,
    type_tag: candidate.cardTypes.has("Leader") ? "Leader" : "Character",
  }));

  for (let offset = 0; offset < newProfiles.length; offset += 250) {
    const { error } = await supabase.from("characters").insert(newProfiles.slice(offset, offset + 250));
    if (error) throw new Error(`Character profile insert failed: ${error.message}`);
  }

  const characters = await fetchPaged<CharacterRow>((from, to) =>
    supabase
      .from("characters")
      .select("id, name, slug, aliases, created_at")
      .eq("game_id", game.id)
      .order("name")
      .range(from, to)
  );
  const patterns = buildCharacterMatchPatterns(characters);
  const idsByPrimaryCharacter = new Map<string, string[]>();
  const unassignedIds: string[] = [];
  const links: Array<{ game_id: string; card_id: string; character_id: string; is_primary: boolean }> = [];
  let multiCharacterCards = 0;
  let unmatchedCharacterCards = 0;

  for (const card of cards) {
    const matches = findCardCharacterMatches(card, patterns);
    const primaryId = matches[0]?.characterId ?? null;
    if (card.character_id !== primaryId) {
      if (primaryId) {
        const ids = idsByPrimaryCharacter.get(primaryId) ?? [];
        ids.push(card.id);
        idsByPrimaryCharacter.set(primaryId, ids);
      } else {
        unassignedIds.push(card.id);
      }
    }
    if (/^(character|leader)$/i.test(card.card_type ?? "") && matches.length === 0) {
      unmatchedCharacterCards += 1;
    }
    if (matches.length > 1) multiCharacterCards += 1;
    matches.forEach((match, index) => {
      links.push({
        game_id: game.id,
        card_id: card.id,
        character_id: match.characterId,
        is_primary: index === 0,
      });
    });
  }

  let primaryAssignmentsChanged = 0;
  for (const [characterId, ids] of idsByPrimaryCharacter) {
    for (let offset = 0; offset < ids.length; offset += 500) {
      const chunk = ids.slice(offset, offset + 500);
      const { error } = await supabase
        .from("cards")
        .update({ character_id: characterId })
        .eq("game_id", game.id)
        .eq("region", "en")
        .in("id", chunk);
      if (error) throw new Error(`Primary character update failed: ${error.message}`);
      primaryAssignmentsChanged += chunk.length;
    }
  }
  for (let offset = 0; offset < unassignedIds.length; offset += 500) {
    const chunk = unassignedIds.slice(offset, offset + 500);
    const { error } = await supabase
      .from("cards")
      .update({ character_id: null })
      .eq("game_id", game.id)
      .eq("region", "en")
      .in("id", chunk);
    if (error) throw new Error(`Primary character cleanup failed: ${error.message}`);
    primaryAssignmentsChanged += chunk.length;
  }

  const { error: deleteLinksError } = await supabase
    .from("card_character_links")
    .delete()
    .eq("game_id", game.id);
  if (deleteLinksError) throw new Error(`Character link reset failed: ${deleteLinksError.message}`);

  for (let offset = 0; offset < links.length; offset += 500) {
    const { error } = await supabase.from("card_character_links").insert(links.slice(offset, offset + 500));
    if (error) throw new Error(`Character link insert failed: ${error.message}`);
  }

  const { error: refreshError } = await supabase.rpc("refresh_public_game_summaries", {
    p_game_id: game.id,
  });
  if (refreshError) throw new Error(`Summary refresh failed: ${refreshError.message}`);

  return {
    charactersBefore: initialCharactersLoaded.length,
    charactersAfter: characters.length,
    charactersCreated: newProfiles.length,
    duplicateProfilesMerged,
    canonicalProfilesUpdated,
    aliasesUpdated,
    cardsScanned: cards.length,
    primaryAssignmentsChanged,
    linkedCards: new Set(links.map((link) => link.card_id)).size,
    characterLinks: links.length,
    multiCharacterCards,
    unmatchedCharacterCards,
    summariesRefreshed: true,
  };
}
