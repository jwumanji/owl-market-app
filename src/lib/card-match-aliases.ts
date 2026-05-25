import { createServiceClient } from "@/lib/supabase-server";

export type CardMatchAliasSource = "psa_import" | "manual_inventory" | "other";

export type CardMatchAliasInput = {
  gameId?: string | null | undefined;
  rawName: string | null | undefined;
  rawCardNumber?: string | null | undefined;
  rawSetHint?: string | null | undefined;
  sourceType?: CardMatchAliasSource;
  cardId?: string | null | undefined;
};

export type CardMatchAliasRow = {
  id: string;
  game_id: string;
  raw_name: string;
  normalized_name: string;
  raw_card_number: string | null;
  normalized_card_number: string;
  raw_set_hint: string | null;
  normalized_set_hint: string;
  source_type: CardMatchAliasSource;
  card_id: string;
  times_used: number | null;
  last_used_at: string | null;
};

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

const NOISE_WORDS = new Set([
  "the",
  "and",
  "card",
  "cards",
  "one",
  "piece",
  "english",
  "version",
  "japanese",
  "set",
  "tcg",
  "2024",
  "2025",
]);

function isMissingAliasTableError(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(
    error?.code === "42P01" ||
      error?.message?.includes("card_match_aliases") ||
      error?.message?.toLowerCase().includes("does not exist")
  );
}

export function normalizeCardAliasName(value: string | null | undefined) {
  const tokens = (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token));

  return Array.from(new Set(tokens)).join(" ");
}

export function normalizeAliasCardNumber(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function normalizeAliasSetHint(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function aliasKey(input: CardMatchAliasInput) {
  return {
    normalizedName: normalizeCardAliasName(input.rawName),
    normalizedCardNumber: normalizeAliasCardNumber(input.rawCardNumber),
    normalizedSetHint: normalizeAliasSetHint(input.rawSetHint),
    sourceType: input.sourceType ?? "other",
  };
}

export async function saveCardMatchAlias(supabase: SupabaseServiceClient, input: CardMatchAliasInput) {
  const rawName = input.rawName?.trim();
  const cardId = input.cardId?.trim();
  const gameId = input.gameId?.trim();
  const key = aliasKey(input);

  if (!rawName || !cardId || !gameId || key.normalizedName.length < 2) {
    return { warning: null };
  }

  const now = new Date().toISOString();
  const existingRes = await supabase
    .from("card_match_aliases")
    .select("id, times_used")
    .eq("game_id", gameId)
    .eq("source_type", key.sourceType)
    .eq("normalized_name", key.normalizedName)
    .eq("normalized_card_number", key.normalizedCardNumber)
    .eq("normalized_set_hint", key.normalizedSetHint)
    .maybeSingle();

  if (existingRes.error) {
    return { warning: isMissingAliasTableError(existingRes.error) ? null : existingRes.error.message };
  }

  if (existingRes.data) {
    const { error } = await supabase
      .from("card_match_aliases")
      .update({
        raw_name: rawName,
        raw_card_number: input.rawCardNumber?.trim() || null,
        raw_set_hint: input.rawSetHint?.trim() || null,
        card_id: cardId,
        times_used: ((existingRes.data as { times_used: number | null }).times_used ?? 0) + 1,
        updated_at: now,
        last_used_at: now,
      })
      .eq("id", (existingRes.data as { id: string }).id);

    return { warning: error && !isMissingAliasTableError(error) ? error.message : null };
  }

  const { error } = await supabase.from("card_match_aliases").insert({
    raw_name: rawName,
    game_id: gameId,
    normalized_name: key.normalizedName,
    raw_card_number: input.rawCardNumber?.trim() || null,
    normalized_card_number: key.normalizedCardNumber,
    raw_set_hint: input.rawSetHint?.trim() || null,
    normalized_set_hint: key.normalizedSetHint,
    source_type: key.sourceType,
    card_id: cardId,
    times_used: 1,
    updated_at: now,
    last_used_at: now,
  });

  return { warning: error && !isMissingAliasTableError(error) ? error.message : null };
}

export async function loadCardMatchAliases(supabase: SupabaseServiceClient, gameId?: string | null) {
  let query = supabase
    .from("card_match_aliases")
    .select(
      "id, game_id, raw_name, normalized_name, raw_card_number, normalized_card_number, raw_set_hint, normalized_set_hint, source_type, card_id, times_used, last_used_at"
    )
    .order("times_used", { ascending: false })
    .limit(50000);

  if (gameId) {
    query = query.eq("game_id", gameId);
  }

  const { data, error } = await query;

  if (error) {
    return { aliases: [] as CardMatchAliasRow[], warning: isMissingAliasTableError(error) ? null : error.message };
  }

  return { aliases: (data ?? []) as CardMatchAliasRow[], warning: null };
}

function aliasMatchScore(input: CardMatchAliasInput, alias: CardMatchAliasRow) {
  const key = aliasKey(input);
  if (key.normalizedName.length < 2) return 0;

  let score = 0;
  if (alias.normalized_name === key.normalizedName) {
    score += 100;
  } else if (
    alias.normalized_name.length >= 6 &&
    (key.normalizedName.includes(alias.normalized_name) || alias.normalized_name.includes(key.normalizedName))
  ) {
    score += 65;
  } else {
    return 0;
  }

  if (alias.normalized_card_number && key.normalizedCardNumber) {
    if (alias.normalized_card_number === key.normalizedCardNumber) score += 35;
    else score -= 40;
  }

  if (alias.normalized_set_hint && key.normalizedSetHint) {
    if (alias.normalized_set_hint === key.normalizedSetHint) score += 25;
    else score -= 25;
  }

  if (input.sourceType && alias.source_type === input.sourceType) score += 12;
  score += Math.min(alias.times_used ?? 0, 20);

  return score;
}

export function findCardAliasMatches(input: CardMatchAliasInput, aliases: CardMatchAliasRow[], minimumScore = 60) {
  return aliases
    .map((alias) => ({ alias, score: aliasMatchScore(input, alias) }))
    .filter(({ score }) => score >= minimumScore)
    .sort((a, b) => b.score - a.score || (b.alias.times_used ?? 0) - (a.alias.times_used ?? 0));
}

export function findBestCardAliasMatch(input: CardMatchAliasInput, aliases: CardMatchAliasRow[]) {
  return findCardAliasMatches(input, aliases, 80)[0]?.alias ?? null;
}
