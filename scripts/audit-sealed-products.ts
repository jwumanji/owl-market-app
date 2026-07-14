import { createClient } from "@supabase/supabase-js";
import { fetchSealedProducts } from "../src/lib/justtcg";
import { buildSealedImportRow, type SealedSetTarget } from "../src/lib/sealed-products";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, slug")
    .eq("slug", "one_piece")
    .single();
  if (gameError) throw gameError;

  const [{ data: setRows, error: setError }, providerProducts, { data: dbRows, error: dbError }] =
    await Promise.all([
      supabase.from("sets").select("id, code, name").eq("game_id", game.id),
      fetchSealedProducts(),
      supabase
        .from("sealed_products")
        .select("tcg_product_id, set_id, product_type, tcg_price")
        .eq("game_id", game.id),
    ]);
  if (setError) throw setError;
  if (dbError) throw dbError;

  const syncedAt = new Date().toISOString();
  const expected = providerProducts.flatMap((product) => {
    const row = buildSealedImportRow(product, game.id, (setRows ?? []) as SealedSetTarget[], syncedAt);
    return row ? [row] : [];
  });
  const current = new Map(
    (dbRows ?? []).map((row) => [String(row.tcg_product_id), row])
  );
  const expectedIds = new Set(expected.map((row) => row.tcg_product_id));
  const typeCounts = expected.reduce<Record<string, number>>((counts, row) => {
    counts[row.product_type] = (counts[row.product_type] ?? 0) + 1;
    return counts;
  }, {});
  const missing = expected.filter((row) => !current.has(row.tcg_product_id));
  const stale = (dbRows ?? []).filter((row) => !expectedIds.has(String(row.tcg_product_id)));
  const mappingMismatches = expected.filter((row) => {
    const actual = current.get(row.tcg_product_id);
    return actual && actual.set_id !== row.set_id;
  });
  const priceMismatches = expected.filter((row) => {
    const actual = current.get(row.tcg_product_id);
    if (!actual) return false;
    const actualPrice = actual.tcg_price == null ? null : Number(actual.tcg_price);
    return actualPrice !== row.tcg_price;
  });
  const unmappedSources = Array.from(
    new Map(
      expected
        .filter((row) => !row.set_id)
        .map((row) => [row.source_set_slug, row.source_set_name])
    ).entries()
  ).map(([slug, name]) => ({ slug, name }));

  console.log(JSON.stringify({
    game: game.slug,
    providerProducts: providerProducts.length,
    expectedRows: expected.length,
    currentRows: dbRows?.length ?? 0,
    pricedRows: expected.filter((row) => (row.tcg_price ?? 0) > 0).length,
    mappedRows: expected.filter((row) => row.set_id).length,
    missingRows: missing.length,
    staleActiveRows: stale.length,
    mappingMismatches: mappingMismatches.length,
    priceMismatches: priceMismatches.length,
    productTypes: typeCounts,
    unmappedSources,
    samples: {
      missing: missing.slice(0, 10).map((row) => ({ id: row.tcg_product_id, name: row.name })),
      mappingMismatches: mappingMismatches.slice(0, 10).map((row) => ({ id: row.tcg_product_id, name: row.name })),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});