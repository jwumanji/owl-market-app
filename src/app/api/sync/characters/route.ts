import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// POST /api/sync/characters — backfill cards with character_id
// Matches card name/name_base against character names from the DB.
// Safe to run multiple times (idempotent).
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (process.env.SYNC_SECRET && token !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Fetch all characters
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, name, slug")
    .order("name");

  if (charErr) {
    return NextResponse.json({ error: charErr.message }, { status: 500 });
  }

  if (!characters || characters.length === 0) {
    return NextResponse.json({ error: "No characters in DB. Run schema-migration-v5.sql first." }, { status: 400 });
  }

  // 2. Build match patterns: sort by name length descending so longer names match first
  //    (e.g. "Monkey D. Luffy" matches before "Luffy")
  const sortedChars = [...characters].sort((a, b) => b.name.length - a.name.length);

  // 3. Fetch all cards that don't have a character_id yet
  const { data: cards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, name, name_base")
    .is("character_id", null);

  if (cardsErr) {
    return NextResponse.json({ error: cardsErr.message }, { status: 500 });
  }

  if (!cards || cards.length === 0) {
    return NextResponse.json({ message: "All cards already tagged", updated: 0 });
  }

  // 4. Match cards to characters in memory
  const updates: { id: string; character_id: string }[] = [];

  for (const card of cards) {
    const cardName = (card.name_base || card.name || "").toLowerCase();
    if (!cardName) continue;

    for (const char of sortedChars) {
      const charNameLower = char.name.toLowerCase();
      if (cardName.includes(charNameLower)) {
        updates.push({ id: card.id, character_id: char.id });
        break; // first (longest) match wins
      }
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ message: "No matches found", updated: 0, total_cards: cards.length });
  }

  // 5. Batch update in chunks of 500
  let updated = 0;
  const chunkSize = 500;

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);

    // Use individual updates since Supabase JS doesn't support batch update by different IDs
    const promises = chunk.map((u) =>
      supabase
        .from("cards")
        .update({ character_id: u.character_id })
        .eq("id", u.id)
    );

    const results = await Promise.all(promises);
    updated += results.filter((r) => !r.error).length;
  }

  return NextResponse.json({
    message: "Backfill complete",
    total_cards: cards.length,
    matched: updates.length,
    updated,
    unmatched: cards.length - updates.length,
  });
}

// Also support GET for easy browser triggering
export { POST as GET };
