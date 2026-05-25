// Merge duplicate `sets` rows that share a code but have divergent slugs
// (e.g. "op-07" and "op07" both with code "OP07"). My earlier `import-set.mjs`
// runs upserted on `slug`, which didn't conflict with the older `op-07`-style
// rows, leaving two sets per code.
//
// For each duplicate group, picks the canonical row by:
//   1. The row whose slug equals the lowercased code (newer convention), OR
//   2. The row that already has a `series` value set, OR
//   3. The oldest row.
//
// Then UPDATEs all `cards.set_id` and `card_collections.set_id` (etc.) from
// the duplicates to canonical, and DELETEs the duplicate set rows.
//
// Read-only by default. Pass --apply to write changes.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/merge-duplicate-sets.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/merge-duplicate-sets.mjs --apply

import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const GAME_SLUG = scriptGameSlug();

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`PATCH ${path}: ${r.status} ${await r.text()}`);
    return false;
  }
  return true;
}

async function sbDelete(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { ...H, Prefer: "return=minimal" },
  });
  if (!r.ok) {
    console.error(`DELETE ${path}: ${r.status} ${await r.text()}`);
    return false;
  }
  return true;
}

const GAME = await loadGameScope({ supabaseUrl: SB_URL, supabaseKey: KEY, gameSlug: GAME_SLUG });
console.log(`Using game scope: ${GAME.slug}`);

const sets = await sbGet(withGameFilter("sets?select=id,game_id,code,slug,name,series,created_at&order=created_at.asc", GAME.id));
const byCode = {};
for (const s of sets) (byCode[s.code] = byCode[s.code] || []).push(s);

const dupes = Object.entries(byCode).filter(([, rows]) => rows.length > 1);
if (dupes.length === 0) {
  console.log("No duplicate sets found.");
  process.exit(0);
}

console.log(`Found ${dupes.length} duplicate set group(s):\n`);

const plans = [];
for (const [code, rows] of dupes) {
  // Pick canonical: prefer the row that already has `series` set (the older
  // row populated by the original schema migration — also has more cards
  // pointing at it, so less migration churn). Fall back to slug matching
  // code, then oldest.
  const target = code.toLowerCase();
  const canonical =
    rows.find((r) => r.series) ??
    rows.find((r) => r.slug === target) ??
    rows[0];
  const duplicates = rows.filter((r) => r.id !== canonical.id);
  plans.push({ code, canonical, duplicates });

  console.log(`  ${code}:`);
  console.log(`    KEEP    id=${canonical.id} slug=${canonical.slug.padEnd(8)} series=${canonical.series ?? "null"}`);
  for (const d of duplicates) {
    console.log(`    MERGE   id=${d.id} slug=${d.slug.padEnd(8)} series=${d.series ?? "null"}`);
  }
}

// Discover which tables reference set_id so we know what to migrate.
const REFERENCING_TABLES = ["cards"]; // Currently the only table with set_id in this schema.

console.log("\nFor each duplicate, will migrate row counts in:");
for (const { duplicates } of plans) {
  for (const d of duplicates) {
    for (const tbl of REFERENCING_TABLES) {
      const rows = await sbGet(withGameFilter(`${tbl}?set_id=eq.${d.id}&select=id`, GAME.id));
      console.log(`  ${tbl}.set_id=${d.id.slice(0, 8)}…: ${rows.length} row(s)`);
    }
  }
}

if (!APPLY) {
  console.log("\nDry run — pass --apply to migrate cards and delete duplicate set rows.");
  process.exit(0);
}

console.log("\nApplying...");
for (const { code, canonical, duplicates } of plans) {
  for (const d of duplicates) {
    for (const tbl of REFERENCING_TABLES) {
      const ok = await sbPatch(withGameFilter(`${tbl}?set_id=eq.${d.id}`, GAME.id), { set_id: canonical.id });
      console.log(`  ${code}: re-pointed ${tbl} from ${d.id.slice(0, 8)}… → ${canonical.id.slice(0, 8)}…: ${ok ? "ok" : "FAILED"}`);
    }
    const okDel = await sbDelete(withGameFilter(`sets?id=eq.${d.id}`, GAME.id));
    console.log(`  ${code}: deleted duplicate set ${d.id.slice(0, 8)}…: ${okDel ? "ok" : "FAILED"}`);
  }
}
console.log("\nDone.");
