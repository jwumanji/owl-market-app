import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { fetchAllSets, fetchSetCards } from "@/lib/optcgapi";

export const maxDuration = 300; // allow up to 5 min on Vercel

interface ApiCard {
  card_image_id: string;
  card_set_id: string;
  card_name: string;
  set_name: string;
  set_id: string;
  rarity: string;
  card_type: string;
  card_color: string;
  card_text: string | null;
  card_cost: string | null;
  card_power: string | null;
  life: number | null;
  sub_types: string | null;
  counter_amount: number | null;
  attribute: string | null;
  card_image: string | null;
  inventory_price: number | null;
  market_price: number | null;
}

function parseIntSafe(val: string | number | null | undefined): number | null {
  if (val == null || val === "" || val === "NULL") return null;
  const n = typeof val === "string" ? parseInt(val, 10) : val;
  return isNaN(n) ? null : n;
}

function deriveVariantLabel(cardImageId: string): string | null {
  return /_p\d+$/.test(cardImageId) ? "Parallel" : null;
}

function deriveNameBase(cardName: string | null): string | null {
  if (!cardName) return null;
  return cardName.replace(/\s*\(Parallel\)\s*$/i, "").trim();
}

function parseSingleColor(color: string | null): string[] {
  if (!color) return [];
  // Colors can be slash-separated e.g. "Red/Green"
  return color.split("/").map((c) => c.trim()).filter(Boolean);
}

function parseSubTypes(subTypes: string | null): string[] {
  if (!subTypes) return [];
  return subTypes.split(/\s+/).filter(Boolean);
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const errors: string[] = [];
  let synced = 0;

  // 1. Fetch all sets from optcgapi
  const sets = await fetchAllSets() as { set_id: string; set_name: string }[];
  if (sets.length === 0) {
    return NextResponse.json({ synced: 0, errors: ["Failed to fetch sets"] });
  }

  // 2. Ensure sets exist in DB
  for (const s of sets) {
    const slug = s.set_id.replace(/\s+/g, "-").toLowerCase();
    const code = s.set_id.replace(/-/g, "").toUpperCase();
    const series = slug.split("-")[0].toUpperCase();
    const { error: setErr } = await supabase.from("sets").upsert(
      { slug, code, name: s.set_name, series },
      { onConflict: "slug" }
    );
    if (setErr) {
      errors.push(`Set upsert failed [${slug}]: ${setErr.message}`);
    }
  }

  // 3. Process each set
  for (const s of sets) {
    const slug = s.set_id.replace(/\s+/g, "-").toLowerCase();

    // Look up set_id in our DB
    const { data: setRow } = await supabase
      .from("sets")
      .select("id")
      .eq("slug", slug)
      .single();

    if (!setRow) {
      errors.push(`Set not found in DB: ${slug}`);
      continue;
    }

    const cards = (await fetchSetCards(s.set_id)) as ApiCard[];
    if (cards.length === 0) continue;

    // Update card_count on the set
    await supabase
      .from("sets")
      .update({ card_count: cards.length })
      .eq("id", setRow.id);

    for (const card of cards) {
      try {
        // Upsert card
        const cardRow = {
          card_image_id: card.card_image_id,
          card_number: card.card_set_id,
          name: card.card_name,
          name_base: deriveNameBase(card.card_name),
          variant_label: deriveVariantLabel(card.card_image_id),
          set_id: setRow.id,
          rarity: card.rarity,
          card_type: card.card_type,
          color: parseSingleColor(card.card_color),
          power: parseIntSafe(card.card_power),
          cost: parseIntSafe(card.card_cost),
          life: parseIntSafe(card.life),
          counter: parseIntSafe(card.counter_amount),
          attribute: card.attribute,
          types: parseSubTypes(card.sub_types),
          effect: card.card_text,
          image_url: card.card_image,
        };

        const { data: upserted, error: cardErr } = await supabase
          .from("cards")
          .upsert(cardRow, { onConflict: "card_image_id" })
          .select("id")
          .single();

        if (cardErr || !upserted) {
          errors.push(`Card upsert failed [${card.card_image_id}]: ${cardErr?.message}`);
          continue;
        }

        const cardId = upserted.id;
        const marketPrice = card.market_price ?? null;
        const inventoryPrice = card.inventory_price ?? null;

        // Upsert price_stats
        const { error: priceErr } = await supabase
          .from("price_stats")
          .upsert(
            {
              card_id: cardId,
              tcg_market: marketPrice,
              tcg_low: inventoryPrice,
              market_avg: marketPrice,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "card_id" }
          );

        if (priceErr) {
          errors.push(`price_stats upsert failed [${card.card_image_id}]: ${priceErr.message}`);
        }

        // Insert price_history snapshot
        const { error: histErr } = await supabase.from("price_history").insert({
          card_id: cardId,
          tcg_market: marketPrice,
          market_avg: marketPrice,
          recorded_at: new Date().toISOString(),
        });

        if (histErr) {
          errors.push(`price_history insert failed [${card.card_image_id}]: ${histErr.message}`);
        }

        synced++;
      } catch (err) {
        errors.push(`Exception on [${card.card_image_id}]: ${err}`);
      }
    }
  }

  return NextResponse.json({ synced, errors: errors.slice(0, 50) });
}
