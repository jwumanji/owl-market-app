import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cards")
    .select(`
      id, name, card_number, rarity, image_url, image_url_small,
      sets (code, name)
    `)
    .or(`name.ilike.%${query}%,card_number.ilike.%${query}%`)
    .order("name")
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
