import type { SupabaseClient } from "@supabase/supabase-js";

import { firstRelation } from "@/lib/supabase-relations";

export type MarketNameSuggestionStatus = "pending" | "approved" | "rejected";
export type MarketNameConfidence = "high" | "medium_high" | "medium" | "research_required";

export type MarketNameEvidence = {
  id: string;
  source_type: string;
  source_name: string;
  source_url: string;
  source_title: string | null;
  evidence_note: string | null;
};

export type MarketNameSuggestion = {
  id: string;
  game_id: string;
  proposed_market_name: string;
  proposed_aliases: string[];
  confidence: MarketNameConfidence;
  status: MarketNameSuggestionStatus;
  research_note: string | null;
  rejection_note: string | null;
  reviewed_at: string | null;
  card: {
    id: string;
    card_image_id: string;
    card_number: string | null;
    official_name: string;
    market_name: string | null;
    variant_label: string | null;
    rarity: string | null;
    image_url: string | null;
    image_url_small: string | null;
    image_url_preview: string | null;
    set_code: string | null;
    set_name: string | null;
    market_avg: number | null;
    aliases: string[];
  };
  evidence: MarketNameEvidence[];
};

type SuggestionRow = {
  id: string;
  game_id: string;
  proposed_market_name: string;
  proposed_aliases: string[] | null;
  confidence: MarketNameConfidence;
  status: MarketNameSuggestionStatus;
  research_note: string | null;
  rejection_note: string | null;
  reviewed_at: string | null;
  cards: Record<string, unknown> | Record<string, unknown>[] | null;
  card_market_name_evidence: MarketNameEvidence[] | null;
};

const SUGGESTION_SELECT = `
  id,
  game_id,
  proposed_market_name,
  proposed_aliases,
  confidence,
  status,
  research_note,
  rejection_note,
  reviewed_at,
  cards!card_market_name_suggestions_card_game_fk (
    id,
    card_image_id,
    card_number,
    name,
    market_name,
    variant_label,
    rarity,
    image_url,
    image_url_small,
    image_url_preview,
    sets!cards_set_game_fk (code, name),
    price_stats!price_stats_card_game_fk (market_avg)
  ),
  card_market_name_evidence (
    id,
    source_type,
    source_name,
    source_url,
    source_title,
    evidence_note
  )
`;

export async function loadMarketNameSuggestions(
  supabase: SupabaseClient,
  gameId: string,
  status: MarketNameSuggestionStatus,
) {
  const [{ data, error }, aliasesResult] = await Promise.all([
    supabase
      .from("card_market_name_suggestions")
      .select(SUGGESTION_SELECT)
      .eq("game_id", gameId)
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("card_market_aliases")
      .select("card_id, alias")
      .eq("game_id", gameId)
      .order("alias"),
  ]);

  if (error) return { data: [] as MarketNameSuggestion[], error: error.message };
  if (aliasesResult.error) return { data: [] as MarketNameSuggestion[], error: aliasesResult.error.message };

  const aliasesByCard = new Map<string, string[]>();
  for (const row of aliasesResult.data ?? []) {
    const aliases = aliasesByCard.get(row.card_id) ?? [];
    aliases.push(row.alias);
    aliasesByCard.set(row.card_id, aliases);
  }

  const suggestions = ((data ?? []) as unknown as SuggestionRow[])
    .map((row): MarketNameSuggestion | null => {
      const card = firstRelation(row.cards);
      if (!card) return null;
      const set = firstRelation(card.sets as Record<string, unknown> | Record<string, unknown>[] | null);
      const priceStats = firstRelation(card.price_stats as Record<string, unknown> | Record<string, unknown>[] | null);
      const cardId = card.id as string;

      return {
        id: row.id,
        game_id: row.game_id,
        proposed_market_name: row.proposed_market_name,
        proposed_aliases: row.proposed_aliases ?? [],
        confidence: row.confidence,
        status: row.status,
        research_note: row.research_note,
        rejection_note: row.rejection_note,
        reviewed_at: row.reviewed_at,
        card: {
          id: cardId,
          card_image_id: card.card_image_id as string,
          card_number: (card.card_number as string | null) ?? null,
          official_name: card.name as string,
          market_name: (card.market_name as string | null) ?? null,
          variant_label: (card.variant_label as string | null) ?? null,
          rarity: (card.rarity as string | null) ?? null,
          image_url: (card.image_url as string | null) ?? null,
          image_url_small: (card.image_url_small as string | null) ?? null,
          image_url_preview: (card.image_url_preview as string | null) ?? null,
          set_code: (set?.code as string | null) ?? null,
          set_name: (set?.name as string | null) ?? null,
          market_avg: (priceStats?.market_avg as number | null) ?? null,
          aliases: aliasesByCard.get(cardId) ?? [],
        },
        evidence: row.card_market_name_evidence ?? [],
      };
    })
    .filter((row): row is MarketNameSuggestion => row != null)
    .sort((a, b) => (b.card.market_avg ?? -1) - (a.card.market_avg ?? -1));

  return { data: suggestions, error: null };
}
export async function loadMarketNameSuggestionCounts(supabase: SupabaseClient, gameId: string) {
  const statuses: MarketNameSuggestionStatus[] = ["pending", "approved", "rejected"];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase
        .from("card_market_name_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("game_id", gameId)
        .eq("status", status),
    ),
  );

  const error = results.find((result) => result.error)?.error;
  return {
    counts: Object.fromEntries(statuses.map((status, index) => [status, results[index].count ?? 0])) as Record<MarketNameSuggestionStatus, number>,
    error: error?.message ?? null,
  };
}
