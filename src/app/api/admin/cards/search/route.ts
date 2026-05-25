import { NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/admin-user";
import { findCardAliasMatches, loadCardMatchAliases } from "@/lib/card-match-aliases";
import {
  PRIVATE_CUSTOM_CARD_SELECT,
  isMissingPrivateCustomCardsError,
  type PrivateCustomCardRow,
} from "@/lib/private-custom-cards";
import { gameParamFromRequest, resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type CardSearchRow = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  set_id: string | null;
  sets: { code: string | null; name: string | null } | null;
  source?: "catalog" | "custom";
};

const SEARCH_SELECT = `
  id, name, card_number, rarity, image_url, image_url_small, set_id,
  sets (code, name)
`;

const STOP_WORDS = new Set([
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
  "2024",
  "2025",
]);

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchTokens(query: string) {
  const tokens = normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 8);
}

function scoreCard(card: CardSearchRow, query: string, tokens: string[]) {
  const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
  const name = normalizeSearchText(card.name);
  const number = normalizeSearchText(card.card_number);
  const setCode = normalizeSearchText(set?.code);
  const setName = normalizeSearchText(set?.name);
  const haystack = `${name} ${number} ${setCode} ${setName}`;
  const normalizedQuery = normalizeSearchText(query);
  let score = 0;

  if (normalizedQuery && haystack.includes(normalizedQuery)) score += 80;
  for (const token of tokens) {
    if (number.includes(token)) score += /^\d+$/.test(token) ? 35 : 18;
    if (name.includes(token)) score += 18;
    if (setName.includes(token)) score += 14;
    if (setCode === token) score += 20;
  }

  if (tokens.includes("anniversary") && set?.code === "P") score += 25;
  if (tokens.includes("promo") && set?.code === "P") score += 30;
  if (/monkey|luffy/.test(normalizedQuery) && /monkey.*luffy|luffy/.test(name)) score += 20;

  return score;
}

function searchKey(card: CardSearchRow) {
  return `${card.source ?? "catalog"}:${card.id}`;
}

function customCardToSearchRow(card: PrivateCustomCardRow): CardSearchRow {
  return {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: "Private",
    image_url: card.image_url,
    image_url_small: card.image_url_small,
    set_id: null,
    sets: { code: card.set_code, name: "Private Custom" },
    source: "custom",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;
  const currentUser = await getCurrentAdminUser();
  const tokens = searchTokens(query);
  const candidates = new Map<string, CardSearchRow>();
  const aliasBoosts = new Map<string, number>();
  const aliasResult = await loadCardMatchAliases(supabase, game.id);
  const aliasMatches = findCardAliasMatches({ rawName: query, sourceType: "psa_import" }, aliasResult.aliases, 60).slice(0, 12);
  const aliasCardIds = Array.from(new Set(aliasMatches.map(({ alias }) => alias.card_id)));

  if (aliasCardIds.length > 0) {
    const { data, error } = await supabase
      .from("cards")
      .select(SEARCH_SELECT)
      .eq("game_id", game.id)
      .in("id", aliasCardIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const card of (data ?? []) as unknown as CardSearchRow[]) {
      const catalogCard = { ...card, source: "catalog" as const };
      candidates.set(searchKey(catalogCard), catalogCard);
    }

    for (const match of aliasMatches) {
      aliasBoosts.set(match.alias.card_id, Math.max(aliasBoosts.get(match.alias.card_id) ?? 0, match.score + 120));
    }
  }

  for (const token of tokens.length > 0 ? tokens : [query]) {
    const { data, error } = await supabase
      .from("cards")
      .select(SEARCH_SELECT)
      .eq("game_id", game.id)
      .or(`name.ilike.%${token}%,card_number.ilike.%${token}%`)
      .limit(60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const card of (data ?? []) as unknown as CardSearchRow[]) {
      const catalogCard = { ...card, source: "catalog" as const };
      candidates.set(searchKey(catalogCard), catalogCard);
    }
  }

  for (const token of tokens) {
    const { data: sets, error: setsError } = await supabase
      .from("sets")
      .select("id")
      .eq("game_id", game.id)
      .or(`name.ilike.%${token}%,code.ilike.%${token}%`)
      .limit(20);

    if (setsError) {
      return NextResponse.json({ error: setsError.message }, { status: 500 });
    }

    const setIds = (sets ?? []).map((set) => set.id).filter(Boolean);
    if (setIds.length === 0) continue;

    const { data, error } = await supabase
      .from("cards")
      .select(SEARCH_SELECT)
      .eq("game_id", game.id)
      .in("set_id", setIds)
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const card of (data ?? []) as unknown as CardSearchRow[]) {
      const catalogCard = { ...card, source: "catalog" as const };
      candidates.set(searchKey(catalogCard), catalogCard);
    }
  }

  if (currentUser) {
    for (const token of tokens.length > 0 ? tokens : [query]) {
      const { data, error } = await supabase
        .from("custom_cards")
        .select(PRIVATE_CUSTOM_CARD_SELECT)
        .eq("user_id", currentUser.id)
        .eq("game_id", game.id)
        .or(`name.ilike.%${token}%,card_number.ilike.%${token}%,set_code.ilike.%${token}%`)
        .limit(60);

      if (error) {
        if (isMissingPrivateCustomCardsError(error)) break;
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const card of (data ?? []) as unknown as PrivateCustomCardRow[]) {
        const customCard = customCardToSearchRow(card);
        candidates.set(searchKey(customCard), customCard);
      }
    }
  }

  const scored = Array.from(candidates.values())
    .map((card) => ({
      card,
      score:
        scoreCard(card, query, tokens) +
        (card.source === "catalog" ? aliasBoosts.get(card.id) ?? 0 : 35),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.card.name ?? "").localeCompare(b.card.name ?? ""))
    .slice(0, 30)
    .map(({ card }) => card);

  return NextResponse.json(scored);
}
