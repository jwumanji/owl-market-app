import { NextResponse } from "next/server";
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServiceClient();
  const tokens = searchTokens(query);
  const candidates = new Map<string, CardSearchRow>();

  for (const token of tokens.length > 0 ? tokens : [query]) {
    const { data, error } = await supabase
      .from("cards")
      .select(SEARCH_SELECT)
      .or(`name.ilike.%${token}%,card_number.ilike.%${token}%`)
      .limit(60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const card of (data ?? []) as unknown as CardSearchRow[]) {
      candidates.set(card.id, card);
    }
  }

  for (const token of tokens) {
    const { data: sets, error: setsError } = await supabase
      .from("sets")
      .select("id")
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
      .in("set_id", setIds)
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const card of (data ?? []) as unknown as CardSearchRow[]) {
      candidates.set(card.id, card);
    }
  }

  const scored = Array.from(candidates.values())
    .map((card) => ({ card, score: scoreCard(card, query, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.card.name ?? "").localeCompare(b.card.name ?? ""))
    .slice(0, 30)
    .map(({ card }) => card);

  return NextResponse.json(scored);
}
