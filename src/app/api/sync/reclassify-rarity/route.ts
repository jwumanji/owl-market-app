import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { classifyRarity } from "@/lib/justtcg-match";

// ---------------------------------------------------------------------------
// GET /api/sync/reclassify-rarity
//
// Scans all cards and reclassifies rarity based on name/variant_label.
// Cards with names like "(Manga)" get reclassified from SEC → MR, etc.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const dryRun = searchParams.get("dry") === "1";

  if (process.env.SYNC_SECRET && token !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all cards with rarity
  const { data: cards, error } = await supabase
    .from("cards")
    .select("id, name, variant_label, rarity")
    .not("rarity", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changes: { id: string; name: string; from: string; to: string }[] = [];

  for (const card of cards ?? []) {
    const newRarity = classifyRarity(
      card.name ?? "",
      card.variant_label ?? null,
      card.rarity
    );
    if (newRarity !== card.rarity) {
      changes.push({
        id: card.id,
        name: card.name,
        from: card.rarity,
        to: newRarity,
      });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalCards: cards?.length ?? 0,
      changesToApply: changes.length,
      changes: changes.map((c) => `${c.name}: ${c.from} → ${c.to}`),
    });
  }

  // Apply changes in batches
  let updated = 0;
  const errors: string[] = [];

  // Group by target rarity to batch updates
  const byRarity = new Map<string, string[]>();
  for (const c of changes) {
    const ids = byRarity.get(c.to) ?? [];
    ids.push(c.id);
    byRarity.set(c.to, ids);
  }

  for (const [rarity, ids] of Array.from(byRarity.entries())) {
    const { error: upErr } = await supabase
      .from("cards")
      .update({ rarity })
      .in("id", ids);

    if (upErr) {
      errors.push(`${rarity}: ${upErr.message}`);
    } else {
      updated += ids.length;
    }
  }

  return NextResponse.json({
    totalCards: cards?.length ?? 0,
    updated,
    errors,
    changes: changes.map((c) => `${c.name}: ${c.from} → ${c.to}`),
  });
}
