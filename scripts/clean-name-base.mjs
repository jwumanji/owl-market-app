// Re-derive `name_base` for every cards row that doesn't match the canonical
// formula (`name` with all parenthetical groups stripped). Older import paths
// (early JustTCG sync, hand-written rows) left variant tags like
// "(Alternate Art)" and card-number annotations like "(025)" inside name_base,
// which breaks grouping and search.
//
// Read-only by default. Pass --apply to write the patches.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/clean-name-base.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/clean-name-base.mjs --apply

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

function nameBase(name) {
  if (!name) return null;
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

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

const cards = await fetchAll("cards?select=id,name,name_base,card_number");
console.log(`Loaded ${cards.length} cards.`);

const diffs = [];
let nullName = 0;
let nullResult = 0;
for (const c of cards) {
  if (!c.name) { nullName++; continue; }
  const should = nameBase(c.name);
  if (!should) { nullResult++; continue; } // strip-only name → skip
  if (should !== c.name_base) {
    diffs.push({ id: c.id, num: c.card_number, current: c.name_base, should, name: c.name });
  }
}

console.log(`name = NULL (skipped):                ${nullName}`);
console.log(`name strips to empty (skipped):       ${nullResult}`);
console.log(`Rows where name_base differs:         ${diffs.length}\n`);

console.log("Top 15 examples:");
for (const d of diffs.slice(0, 15)) {
  console.log(
    `  ${(d.num ?? "?").padEnd(14)} current=${JSON.stringify(d.current ?? "").padEnd(45)} → ${JSON.stringify(d.should)}`,
  );
}

if (!APPLY) {
  console.log("\nDry run — pass --apply to patch.");
  process.exit(0);
}

console.log(`\nApplying ${diffs.length} patches...`);
const CHUNK = 25; // parallel chunk; each row is its own PATCH
let ok = 0;
let fail = 0;
for (let i = 0; i < diffs.length; i += CHUNK) {
  const slice = diffs.slice(i, i + CHUNK);
  const results = await Promise.all(slice.map((d) => patch(d.id, { name_base: d.should })));
  for (const r of results) (r ? ok++ : fail++);
  if ((i / CHUNK) % 4 === 0) {
    process.stdout.write(`  ${Math.min(i + CHUNK, diffs.length)}/${diffs.length}\r`);
  }
}
console.log(`\nPatched: ${ok}   Failed: ${fail}`);
