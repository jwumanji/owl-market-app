import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { synchronizeCharacterIndex } from "../src/lib/character-index-sync";
import {
  buildCharacterMatchPatterns,
  findCardCharacterMatches,
  normalizeCharacterMatchText,
} from "../src/lib/character-card-matcher";

type CharacterRow = {
  id: string;
  name: string;
  slug: string;
  aliases: string[] | null;
};

type CardRow = {
  id: string;
  name: string;
  name_base: string | null;
  card_type: string | null;
  character_id: string | null;
  region: string | null;
};

type PriceRow = {
  card_id: string;
  tcg_market: number | string | null;
  market_avg: number | string | null;
};

type SummaryRow = {
  character_id: string;
  card_count: number | null;
  priced_count: number | null;
  index_value: number | string | null;
};

type CharacterLinkRow = {
  card_id: string;
  character_id: string;
  is_primary: boolean;
};

function loadEnvFile(file = path.resolve(process.cwd(), ".env.local")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] == null) process.env[key] = value;
  }
}

function argument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchPaged<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
) {
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

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function main() {
loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const gameSlug = argument("game", "one_piece");
const jsonOutput = process.argv.includes("--json");
const repair = process.argv.includes("--repair");
const namesOnly = process.argv.includes("--names-only");
const profilesOnly = process.argv.includes("--profiles-only");
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: game, error: gameError } = await supabase
  .from("games")
  .select("id, slug, name")
  .eq("slug", gameSlug)
  .single();
if (gameError || !game) throw new Error(gameError?.message ?? `Unknown game: ${gameSlug}`);

if (repair) {
  console.log(JSON.stringify(await synchronizeCharacterIndex(supabase, game), null, 2));
  return;
}

const [characters, cards, prices, summaries, characterLinks] = await Promise.all([
  fetchPaged<CharacterRow>((from, to) =>
    supabase
      .from("characters")
      .select("id, name, slug, aliases")
      .eq("game_id", game.id)
      .order("name")
      .range(from, to)
  ),
  fetchPaged<CardRow>((from, to) =>
    supabase
      .from("cards")
      .select("id, name, name_base, card_type, character_id, region")
      .eq("game_id", game.id)
      .eq("region", "en")
      .order("id")
      .range(from, to)
  ),
  fetchPaged<PriceRow>((from, to) =>
    supabase
      .from("price_stats")
      .select("card_id, tcg_market, market_avg")
      .eq("game_id", game.id)
      .range(from, to)
  ),
  fetchPaged<SummaryRow>((from, to) =>
    supabase
      .from("public_character_summaries")
      .select("character_id, card_count, priced_count, index_value")
      .eq("game_id", game.id)
      .range(from, to)
  ),
  fetchPaged<CharacterLinkRow>((from, to) =>
    supabase
      .from("card_character_links")
      .select("card_id, character_id, is_primary")
      .eq("game_id", game.id)
      .range(from, to)
  ),
]);

const patterns = buildCharacterMatchPatterns(characters);
const characterById = new Map(characters.map((character) => [character.id, character]));
const priceByCardId = new Map(prices.map((price) => [price.card_id, price]));
const summaryByCharacterId = new Map(summaries.map((summary) => [summary.character_id, summary]));
const linksByCardId = new Map<string, CharacterLinkRow[]>();
for (const link of characterLinks) {
  const links = linksByCardId.get(link.card_id) ?? [];
  links.push(link);
  linksByCardId.set(link.card_id, links);
}
const assignedCounts = new Map<string, number>();
const predictedCounts = new Map<string, number>();
const pricedCounts = new Map<string, number>();
const indexValues = new Map<string, number>();

const missing: Array<Record<string, unknown>> = [];
const conflicts: Array<Record<string, unknown>> = [];
const ambiguous: Array<Record<string, unknown>> = [];
const assignedWithoutNameMatch: Array<Record<string, unknown>> = [];
const linkMismatches: Array<Record<string, unknown>> = [];
const unmatchedCharacterCards = new Map<string, { count: number; cardType: string; samples: string[] }>();

for (const card of cards) {
  const matches = findCardCharacterMatches(card, patterns);
  const predicted = matches[0] ?? null;
  const assigned = card.character_id ? characterById.get(card.character_id) ?? null : null;
  const actualLinks = linksByCardId.get(card.id) ?? [];
  const price = priceByCardId.get(card.id);
  const effectivePrice = price?.tcg_market ?? price?.market_avg;
  for (const link of actualLinks) {
    increment(assignedCounts, link.character_id);
    if (effectivePrice != null) {
      increment(pricedCounts, link.character_id);
      indexValues.set(link.character_id, (indexValues.get(link.character_id) ?? 0) + numeric(effectivePrice));
    }
  }

  for (const match of matches) increment(predictedCounts, match.characterId);

  if (matches.length > 1) {
    ambiguous.push({
      card_id: card.id,
      card_name: card.name_base || card.name,
      assigned: assigned?.name ?? null,
      candidates: matches.map((match) =>
        `${characterById.get(match.characterId)?.name ?? match.characterId} via ${JSON.stringify(match.matchedPattern)}`
      ),
    });
  }

  const predictedIds = new Set(matches.map((match) => match.characterId));
  const actualIds = new Set(actualLinks.map((link) => link.character_id));
  const missingLinkIds = [...predictedIds].filter((id) => !actualIds.has(id));
  const extraLinkIds = [...actualIds].filter((id) => !predictedIds.has(id));
  if (missingLinkIds.length || extraLinkIds.length) {
    linkMismatches.push({
      card_id: card.id,
      card_name: card.name_base || card.name,
      missing_links: missingLinkIds.map((id) => characterById.get(id)?.name ?? id),
      extra_links: extraLinkIds.map((id) => characterById.get(id)?.name ?? id),
    });
  }

  if (predicted && !card.character_id) {
    missing.push({
      card_id: card.id,
      card_name: card.name_base || card.name,
      predicted_character: characterById.get(predicted.characterId)?.name ?? predicted.characterId,
      matched_pattern: predicted.matchedPattern,
    });
  } else if (predicted && card.character_id !== predicted.characterId) {
    conflicts.push({
      card_id: card.id,
      card_name: card.name_base || card.name,
      assigned_character: assigned?.name ?? card.character_id,
      predicted_character: characterById.get(predicted.characterId)?.name ?? predicted.characterId,
      matched_pattern: predicted.matchedPattern,
    });
  } else if (!predicted && card.character_id) {
    assignedWithoutNameMatch.push({
      card_id: card.id,
      card_name: card.name_base || card.name,
      assigned_character: assigned?.name ?? card.character_id,
    });
  }

  if (!predicted && /^(character|leader)$/i.test(card.card_type ?? "")) {
    const sourceName = card.name_base || card.name;
    const normalized = normalizeCharacterMatchText(sourceName);
    const entry = unmatchedCharacterCards.get(normalized) ?? {
      count: 0,
      cardType: card.card_type ?? "",
      samples: [],
    };
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(sourceName);
    unmatchedCharacterCards.set(normalized, entry);
  }
}

const perCharacter = characters.map((character) => {
  const assigned = assignedCounts.get(character.id) ?? 0;
  const predicted = predictedCounts.get(character.id) ?? 0;
  const priced = pricedCounts.get(character.id) ?? 0;
  const indexValue = Math.round((indexValues.get(character.id) ?? 0) * 100) / 100;
  const summary = summaryByCharacterId.get(character.id);
  return {
    character: character.name,
    assigned_cards: assigned,
    predicted_cards: predicted,
    priced_cards: priced,
    computed_index: indexValue,
    summary_card_count: summary?.card_count ?? null,
    summary_priced_count: summary?.priced_count ?? null,
    summary_index: summary ? Math.round(numeric(summary.index_value) * 100) / 100 : null,
    mapping_delta: assigned - predicted,
    summary_matches:
      summary != null &&
      summary.card_count === assigned &&
      summary.priced_count === priced &&
      Math.abs(numeric(summary.index_value) - indexValue) < 0.02,
  };
});

const summaryMismatches = perCharacter.filter((row) => !row.summary_matches);
const charactersWithoutAssignedCards = perCharacter.filter((row) => row.assigned_cards === 0);
const unmatchedCharacterNames = Array.from(unmatchedCharacterCards.entries())
  .map(([normalized_name, value]) => ({ normalized_name, ...value }))
  .sort((a, b) => b.count - a.count || a.normalized_name.localeCompare(b.normalized_name));
const suspiciousShortPatterns = patterns
  .filter((pattern) => pattern.normalizedPattern.length <= 3)
  .map((pattern) => ({
    character: characterById.get(pattern.characterId)?.name ?? pattern.characterId,
    source_pattern: pattern.sourcePattern,
    normalized_pattern: pattern.normalizedPattern,
  }));

const report = {
  game: { id: game.id, slug: game.slug, name: game.name },
  totals: {
    characters: characters.length,
    english_cards: cards.length,
    assigned_cards: cards.filter((card) => card.character_id != null).length,
    primary_name_matches: cards.filter((card) => findCardCharacterMatches(card, patterns).length > 0).length,
    missing_assignments: missing.length,
    conflicting_assignments: conflicts.length,
    ambiguous_names: ambiguous.length,
    assigned_without_name_match: assignedWithoutNameMatch.length,
    characters_without_assigned_cards: charactersWithoutAssignedCards.length,
    summary_mismatches: summaryMismatches.length,
    character_link_mismatches: linkMismatches.length,
    character_links: characterLinks.length,
    unmatched_character_or_leader_names: unmatchedCharacterNames.length,
    suspicious_short_patterns: suspiciousShortPatterns.length,
  },
  missing_assignments: missing,
  conflicting_assignments: conflicts,
  ambiguous_names: ambiguous,
  assigned_without_name_match: assignedWithoutNameMatch,
  characters_without_assigned_cards: charactersWithoutAssignedCards,
  summary_mismatches: summaryMismatches,
  character_link_mismatches: linkMismatches,
  unmatched_character_or_leader_names: unmatchedCharacterNames,
  suspicious_short_patterns: suspiciousShortPatterns,
  per_character: perCharacter.sort((a, b) => b.computed_index - a.computed_index),
};

if (namesOnly) {
  console.log(unmatchedCharacterNames.map((row) => row.samples[0]).join("\n"));
  return;
}

if (profilesOnly) {
  for (const character of characters) {
    console.log(`${character.name}\t${(character.aliases ?? []).join(" | ")}`);
  }
  return;
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Character mapping audit: ${game.name} (${game.slug})`);
  console.table(report.totals);
  for (const [label, rows] of [
    ["Missing assignments", missing],
    ["Conflicting assignments", conflicts],
    ["Ambiguous names", ambiguous],
    ["Assigned without a current name match", assignedWithoutNameMatch],
    ["Characters without assigned cards", charactersWithoutAssignedCards],
    ["Summary mismatches", summaryMismatches],
    ["Character link mismatches", linkMismatches],
    ["Unmatched Character/Leader names", unmatchedCharacterNames],
    ["Suspicious short character patterns", suspiciousShortPatterns],
  ] as const) {
    console.log(`\n${label}: ${rows.length}`);
    console.table(rows.slice(0, 100));
  }
}

if (missing.length > 0 || conflicts.length > 0 || summaryMismatches.length > 0 || linkMismatches.length > 0) {
  process.exitCode = 1;
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
