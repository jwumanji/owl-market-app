import { createServiceClient } from "@/lib/supabase-server";

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

export type PublicRaritySummaryRow = {
  game_id: string;
  rarity_code: string;
  rarity_id: string | null;
  rarity_name: string | null;
  sort_order: number | null;
  card_count: number | null;
  priced_count: number | null;
  index_value: number | string | null;
  avg_card_price: number | string | null;
  chg_7d: number | string | null;
  chg_30d: number | string | null;
  top_cards: unknown;
  updated_at: string | null;
};

export type PublicCharacterSummaryRow = {
  game_id: string;
  character_id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  faction: string | null;
  tier: number | null;
  type_tag: string | null;
  card_count: number | null;
  priced_count: number | null;
  index_value: number | string | null;
  chg_7d: number | string | null;
  chg_30d: number | string | null;
  top_cards: unknown;
  updated_at: string | null;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

function isUnavailableSummaryError(error: SupabaseError | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST202" ||
    message.includes("public_rarity_summaries") ||
    message.includes("public_character_summaries") ||
    message.includes("refresh_public_game_summaries") ||
    message.includes("could not find the function")
  );
}

export async function loadPublicRaritySummaryRows(supabase: SupabaseServiceClient, gameId: string) {
  const { data, error } = await supabase
    .from("public_rarity_summaries")
    .select(`
      game_id,
      rarity_code,
      rarity_id,
      rarity_name,
      sort_order,
      card_count,
      priced_count,
      index_value,
      avg_card_price,
      chg_7d,
      chg_30d,
      top_cards,
      updated_at
    `)
    .eq("game_id", gameId)
    .order("sort_order")
    .order("index_value", { ascending: false });

  if (error) {
    if (isUnavailableSummaryError(error)) return null;
    throw new Error(error.message);
  }

  return data && data.length > 0 ? (data as PublicRaritySummaryRow[]) : null;
}

export async function loadPublicCharacterSummaryRows(supabase: SupabaseServiceClient, gameId: string) {
  const { data, error } = await supabase
    .from("public_character_summaries")
    .select(`
      game_id,
      character_id,
      slug,
      name,
      subtitle,
      faction,
      tier,
      type_tag,
      card_count,
      priced_count,
      index_value,
      chg_7d,
      chg_30d,
      top_cards,
      updated_at
    `)
    .eq("game_id", gameId)
    .order("index_value", { ascending: false });

  if (error) {
    if (isUnavailableSummaryError(error)) return null;
    throw new Error(error.message);
  }

  return data && data.length > 0 ? (data as PublicCharacterSummaryRow[]) : null;
}

export async function refreshPublicGameSummaries(supabase: SupabaseServiceClient, gameId: string) {
  const { error } = await supabase.rpc("refresh_public_game_summaries", { p_game_id: gameId });
  if (error && !isUnavailableSummaryError(error)) {
    throw new Error(error.message);
  }
}

