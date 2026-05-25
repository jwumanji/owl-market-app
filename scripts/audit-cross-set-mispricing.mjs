// Diagnose rows whose prices look mispriced under the old (pre-fix) JustTCG
// sync logic. The classic symptom: a base-rarity card from a starter deck
// or older booster carries a price that obviously belongs to its TR/SP
// box-topper variant distributed via a later set.
//
// Heuristics (no destructive writes — read-only audit):
//   1. Base rows (variant_label IS NULL) priced > $20 with no parallel/SP
//      sibling row in the same set. Suspicious — the price probably leaked
//      from a TR/SP variant whose row never got created.
//   2. Cards whose card_number prefix differs from their set_id's set code
//      AND have no variant suffix in card_image_id. Likely mis-routed.
//   3. Pairs where a base row carries a higher price than its sibling
//      variants of the same card_number. Almost always indicates the
//      variant price got applied to the base.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-cross-set-mispricing.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-cross-set-mispricing.mjs --clear-stale
//     (--clear-stale wipes tcg_market on flagged base rows so the next sync
//      can re-price them against the fixed matcher.)

import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}
const CLEAR_STALE = process.argv.includes("--clear-stale");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const GAME_SLUG = scriptGameSlug();

async function fetchAll(path) {
  const all = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${SB_URL}/rest/v1/${path}${sep}limit=${PAGE}&offset=${offset}`, { headers: H });
    if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
    const batch = await r.json();
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function patch(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error(`PATCH ${path}: ${r.status} ${await r.text()}`);
  return r.ok;
}

const GAME = await loadGameScope({ supabaseUrl: SB_URL, supabaseKey: KEY, gameSlug: GAME_SLUG });
console.log(`Using game scope: ${GAME.slug}`);

const sets = await fetchAll(withGameFilter("sets?select=id,code,slug", GAME.id));
const setIdToCode = new Map(sets.map((s) => [s.id, (s.code ?? "").toUpperCase()]));
const promoSetId = sets.find((s) => s.slug === "p" || s.slug === "promo")?.id ?? null;

const cards = await fetchAll(withGameFilter("cards?select=id,set_id,name,card_number,card_image_id,variant_label,rarity,price_stats(tcg_market,market_avg,updated_at)", GAME.id));
console.log(`Loaded ${cards.length} cards.\n`);

const tcgPrice = (c) => {
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  return ps?.tcg_market ?? null;
};

// Group cards by card_number for sibling comparisons.
const byNumber = new Map();
for (const c of cards) {
  if (!c.card_number) continue;
  const arr = byNumber.get(c.card_number) ?? [];
  arr.push(c);
  byNumber.set(c.card_number, arr);
}

// ---------------------------------------------------------------------------
// Heuristic 1: base row priced > $20 with no variant siblings
// ---------------------------------------------------------------------------
const orphanBaseHighPrice = [];
for (const [num, group] of byNumber) {
  if (group.length !== 1) continue;
  const c = group[0];
  if (c.set_id === promoSetId) continue;
  if (c.variant_label) continue;
  const price = tcgPrice(c);
  if (price && price > 20) {
    orphanBaseHighPrice.push({ c, price });
  }
}
orphanBaseHighPrice.sort((a, b) => b.price - a.price);

console.log("=== Heuristic 1: base rows >$20 with no variant siblings ===");
console.log("(likely TR/SP price leaked onto base row)\n");
for (const { c, price } of orphanBaseHighPrice.slice(0, 25)) {
  console.log(
    `  $${String(price).padStart(7)}  ${(setIdToCode.get(c.set_id) ?? "?").padEnd(6)} ${(c.card_number ?? "").padEnd(12)} ${(c.rarity ?? "").padEnd(4)} ${c.name}`
  );
}
if (orphanBaseHighPrice.length > 25) console.log(`  …and ${orphanBaseHighPrice.length - 25} more`);
console.log(`Total flagged: ${orphanBaseHighPrice.length}\n`);

// ---------------------------------------------------------------------------
// Heuristic 2: card_number prefix doesn't match its set_id's code,
// no variant suffix in card_image_id, and the row carries a price.
// ---------------------------------------------------------------------------
const misroutedBare = [];
for (const c of cards) {
  if (c.set_id === promoSetId) continue;
  if (!c.card_number || !c.card_image_id) continue;
  const setCode = setIdToCode.get(c.set_id);
  if (!setCode) continue;
  const numberPrefix = (c.card_number.match(/^([A-Z]+\d+)/) ?? [])[1] ?? null;
  if (!numberPrefix || numberPrefix === setCode) continue;
  // Variant suffix means the row is a legit cross-set variant (e.g. _p2)
  if (/_(p\d+|r\d+|alt|tr|sp)/i.test(c.card_image_id)) continue;
  // Promo prefix is fine
  if (c.card_image_id.startsWith("P-")) continue;
  const price = tcgPrice(c);
  misroutedBare.push({ c, price });
}
console.log("=== Heuristic 2: bare cards whose number prefix ≠ set_id ===");
console.log("(card may be living in the wrong set entirely)\n");
for (const { c, price } of misroutedBare.slice(0, 25)) {
  const setCode = setIdToCode.get(c.set_id);
  const numberPrefix = (c.card_number.match(/^([A-Z]+\d+)/) ?? [])[1];
  const priceStr = price != null ? `$${price}` : "(no price)";
  console.log(
    `  ${priceStr.padStart(8)}  set=${setCode?.padEnd(5)} num_prefix=${numberPrefix?.padEnd(5)} ${c.card_image_id.padEnd(22)} ${c.name}`
  );
}
if (misroutedBare.length > 25) console.log(`  …and ${misroutedBare.length - 25} more`);
console.log(`Total flagged: ${misroutedBare.length}\n`);

// ---------------------------------------------------------------------------
// Heuristic 3: base row priced higher than its variant siblings
// ---------------------------------------------------------------------------
const inverted = [];
for (const [num, group] of byNumber) {
  if (group.length < 2) continue;
  const base = group.find((c) => !c.variant_label && c.set_id !== promoSetId);
  if (!base) continue;
  const basePrice = tcgPrice(base);
  if (!basePrice || basePrice < 5) continue;
  const variants = group.filter((c) => c !== base && c.variant_label);
  if (variants.length === 0) continue;
  const variantMax = Math.max(
    ...variants.map((c) => tcgPrice(c) ?? 0),
  );
  if (basePrice > variantMax * 2 && basePrice > 10) {
    inverted.push({ base, basePrice, variants, variantMax });
  }
}
inverted.sort((a, b) => b.basePrice - a.basePrice);

console.log("=== Heuristic 3: base rows priced > 2× their highest variant ===");
console.log("(strong signal that variant price got applied to base)\n");
for (const { base, basePrice, variantMax } of inverted.slice(0, 15)) {
  console.log(
    `  base=$${String(basePrice).padStart(7)} maxVar=$${String(variantMax).padStart(7)}  ${(setIdToCode.get(base.set_id) ?? "?").padEnd(5)} ${(base.card_number ?? "").padEnd(12)} ${base.name}`
  );
}
if (inverted.length > 15) console.log(`  …and ${inverted.length - 15} more`);
console.log(`Total flagged: ${inverted.length}\n`);

// ---------------------------------------------------------------------------
// Optional: clear stale prices on H1+H3 hits so the fixed sync re-prices.
// ---------------------------------------------------------------------------
if (CLEAR_STALE) {
  const toClear = new Set();
  for (const { c } of orphanBaseHighPrice) toClear.add(c.id);
  for (const { base } of inverted) toClear.add(base.id);

  console.log(`\n--clear-stale: clearing tcg_market on ${toClear.size} flagged base rows.`);
  console.log("Next JustTCG sync should re-price them against the new matcher.\n");

  let cleared = 0;
  for (const id of toClear) {
    const ok = await patch(`price_stats?card_id=eq.${id}&game_id=eq.${encodeURIComponent(GAME.id)}`, { tcg_market: null, market_avg: null });
    if (ok) cleared++;
  }
  console.log(`Cleared ${cleared}/${toClear.size}.`);
} else {
  console.log("Pass --clear-stale to wipe tcg_market on H1+H3 hits.");
  console.log("(Read-only by default — review the lists above first.)");
}
