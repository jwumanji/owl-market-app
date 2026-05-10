// Re-apply the promo-segment classifier (from import-promos.mjs) to every
// existing card row. Useful after refining SEGMENT_RULES — patches
// promo_segment in place without re-fetching from optcgapi.
//
// Read-only by default. Pass --apply to write the patches.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reclassify-promo-segments.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reclassify-promo-segments.mjs --apply

import { classifySegment } from "./import-promos.mjs";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

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

async function patch(id, body) {
  const r = await fetch(`${SB_URL}/rest/v1/cards?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`patch ${id}: ${r.status} ${await r.text()}`);
    return false;
  }
  return true;
}

// Only consider cards that already have a promo_segment value — re-classifying
// a non-promo card row would erroneously stamp a segment on it.
const cards = await fetchAll("cards?select=id,name,card_number,promo_segment&promo_segment=not.is.null");
console.log(`Loaded ${cards.length} cards with a promo_segment.`);

// Conservative direction: only promote rows currently sitting in "Other" to
// a more specific segment. Never overwrite an existing classification — the
// JustTCG price sync sometimes rewrites `name` to a parens-stripped form
// after the original promo import, so re-deriving from `name` for a row
// that's already classified would clobber it back to "Other".
const diffs = [];
let alreadyClassified = 0;
let stillOther = 0;
for (const c of cards) {
  if (!c.name) continue;
  if (c.promo_segment !== "Other") { alreadyClassified++; continue; }
  const should = classifySegment(c.name);
  if (should === "Other") { stillOther++; continue; }
  diffs.push({ id: c.id, num: c.card_number, name: c.name, current: c.promo_segment, should });
}
console.log(`Already classified (untouched): ${alreadyClassified}`);
console.log(`Still "Other" after re-classify: ${stillOther}`);

console.log(`Rows where classifier output differs: ${diffs.length}\n`);

const movement = {};
for (const d of diffs) {
  const k = `${d.current} → ${d.should}`;
  movement[k] = (movement[k] || 0) + 1;
}
console.log("Movement summary:");
for (const [k, v] of Object.entries(movement).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

console.log("\nSample (first 20):");
for (const d of diffs.slice(0, 20)) {
  console.log(
    `  ${(d.num ?? "?").padEnd(14)} ${(d.current ?? "Other").padEnd(22)} → ${(d.should ?? "Other").padEnd(22)} ${d.name}`,
  );
}

if (!APPLY) {
  console.log("\nDry run — pass --apply to patch.");
  process.exit(0);
}

console.log(`\nApplying ${diffs.length} patches...`);
const CHUNK = 25;
let ok = 0;
let fail = 0;
for (let i = 0; i < diffs.length; i += CHUNK) {
  const slice = diffs.slice(i, i + CHUNK);
  const results = await Promise.all(slice.map((d) => patch(d.id, { promo_segment: d.should })));
  for (const r of results) (r ? ok++ : fail++);
}
console.log(`\nPatched: ${ok}   Failed: ${fail}`);
