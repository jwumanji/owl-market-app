// ---------------------------------------------------------------------------
// audit:booster-baseline — tripwire for the booster-baseline classifier.
//
// A hardcoded exclusion list only catches what someone already noticed. The
// classifier's id-grammar rule is structural, but plain-id leaks (OP04-015
// style: product/venue paper whose id looks like ordinary booster paper) can
// only surface through their PRICES. This audit sweeps the live catalog with
// the REAL classifier module (src/lib/games/one-piece/booster-baseline.ts,
// imported via Node type-stripping — never a re-implementation) and flags any
// INCLUDED card that violates one of three detectors:
//
//   A · GRAMMAR INVARIANT — an included card whose id starts with "P-", parses
//       as product-origin (hasProductOriginIdSuffix), or is rarity PR. Zero by
//       construction while the classifier is intact; fires when someone breaks
//       the rule wiring. This is the detector that catches all four known
//       leaks in --selftest.
//   B · PEER-MEDIAN MULTIPLE — within (printed_set_code, rarity, variant-
//       bucket) peers (bucket: base plain-id / _p parallel / _r reprint /
//       other underscore axis), flag price > MEDIAN_MULT × group median, for
//       groups of MIN_GROUP_SIZE+. Buckets keep chase parallels from being
//       compared against bulk bases.
//   C · BASE-BUCKET ABSOLUTE CEILING — flag any plain-id (base-bucket) card
//       priced above BASE_ABS_CEILING. Covers sparse groups detector B must
//       skip (a leak with no same-class peers has no median to fail).
//
// CALIBRATION (full-catalog sweep, 2026-07-27, en region, prices > 0):
//   · MEDIAN_MULT = 250 — the largest LEGIT multiple observed is 211×
//     (ST21-009 "Nami" $31.62 vs ST21|C|base median $0.15 — real chase paper,
//     must not flag; same for the $4k+ MR/SP parallels, which live in their
//     own parallel buckets). The smallest KNOWN-LEAK multiple is 382×
//     (OP06-047 "(SP)" $84.15 vs OP06|R|base median $0.22, were its name rule
//     to regress); the two OP09 L leaks sit at 909–965×, OP04-015 at ~1,000×.
//   · MIN_GROUP_SIZE = 8 — 263 of 389 (set, rarity, bucket) groups are
//     smaller, and tiny hit-class groups are dominated by legit chase spread;
//     medians there are noise. Detector C covers the sparse base groups.
//   · BASE_ABS_CEILING = 400 — the most expensive legit plain-id card in the
//     entire catalog is ST10-010 (TR) $141.80 (next: OP10-063 TR $79.93,
//     ST21-001 L $44.61, OP09-118 SEC $36.04); 400 is ~2.8× headroom. Catches
//     anniversary-set-class leaks ($1,582 MR) that have no peers to median.
//   · Known blind spot, on purpose: a plain-id product card priced INSIDE the
//     legit envelope with no same-class peers (the OP07-051-alt-art-promo
//     $141.90 pattern) is invisible to B and C — only its id gives it away
//     (detector A / the classifier's grammar rule).
//
// Population parity with load-sealed-detail.ts: en region, tcg_market > 0,
// deduped on card_image_id keeping the max-priced row.
//
// Usage:
//   node scripts/audit-booster-baseline.mjs             # audit; exit 1 on flags
//   node scripts/audit-booster-baseline.mjs --selftest  # prove the tripwire
// --selftest re-includes the four known (now structurally excluded) leaks —
//   OP09-001-magazine-promo, OP09-061-special-edition,
//   OP09-051-anniversary-set, OP07-051-alt-art-promo —
// and requires: (a) the normal audit is clean, (b) every control flags.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEDIAN_MULT = 250;
const MIN_GROUP_SIZE = 8;
const BASE_ABS_CEILING = 400;

const SELFTEST_CONTROL_IDS = [
  "OP09-001-magazine-promo",
  "OP09-061-special-edition",
  "OP09-051-anniversary-set",
  "OP07-051-alt-art-promo",
];

const selftest = process.argv.includes("--selftest");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { classifyBoosterBaseline, hasProductOriginIdSuffix } = await import(
  new URL("../src/lib/games/one-piece/booster-baseline.ts", import.meta.url).href
);

function loadEnvFile(p = path.join(repoRoot, ".env.local")) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}
loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

async function sbFetchAll(query, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase ${query} failed: ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// -- catalog (loader parity: en, priced, deduped on card_image_id keep max) --

const games = await sbFetchAll("games?select=id,slug");
const onePiece = games.find((g) => g.slug === "one_piece" || g.slug === "one-piece");
if (!onePiece) throw new Error(`one_piece game not found; slugs: ${games.map((g) => g.slug).join(", ")}`);

const raw = await sbFetchAll(
  `cards?select=card_image_id,name,rarity,printed_set_code,region,` +
    `price_stats!price_stats_card_game_fk(tcg_market)` +
    `&game_id=eq.${onePiece.id}&region=eq.en&order=card_image_id.asc`
);

const byImageId = new Map();
for (const row of raw) {
  const ps = Array.isArray(row.price_stats) ? row.price_stats[0] : row.price_stats;
  const price = ps?.tcg_market ?? null;
  const id = row.card_image_id;
  if (!id || price == null || price <= 0) continue;
  const card = { id, name: row.name, rarity: row.rarity, set: row.printed_set_code, price };
  const cur = byImageId.get(id);
  if (!cur || price > cur.price) byImageId.set(id, card);
}
const catalog = [...byImageId.values()];
console.log(`booster-baseline audit — ${catalog.length} priced en cards (of ${raw.length} rows)`);

// -- classify (selftest force-includes the controls) -------------------------

function isIncluded(card) {
  if (selftest && SELFTEST_CONTROL_IDS.includes(card.id)) return true;
  return classifyBoosterBaseline({ cardImageId: card.id, name: card.name, rarity: card.rarity })
    .included;
}

function bucketOf(id) {
  const us = id.indexOf("_");
  if (us < 0) return "base";
  const suffix = id.slice(us).toLowerCase();
  if (suffix.startsWith("_p")) return "parallel";
  if (suffix.startsWith("_r")) return "reprint";
  return "other";
}

function median(sortedAsc) {
  const mid = sortedAsc.length >> 1;
  return sortedAsc.length % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function runDetectors(included) {
  const flags = []; // { detector, card, detail }

  // A · grammar invariant
  for (const c of included) {
    if (c.id.startsWith("P-")) {
      flags.push({ detector: "A", card: c, detail: "included card with P- promo id" });
    } else if (hasProductOriginIdSuffix(c.id)) {
      flags.push({ detector: "A", card: c, detail: "included card with product-origin id suffix" });
    } else if ((c.rarity ?? "") === "PR") {
      flags.push({ detector: "A", card: c, detail: "included card with PR rarity" });
    }
  }

  // B · peer-median multiple within (set, rarity, bucket)
  const groups = new Map();
  for (const c of included) {
    if (!c.set || !c.rarity) continue;
    const key = `${c.set}|${c.rarity}|${bucketOf(c.id)}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  for (const [key, arr] of groups) {
    if (arr.length < MIN_GROUP_SIZE) continue;
    const med = median(arr.map((c) => c.price).sort((a, b) => a - b));
    if (med <= 0) continue;
    for (const c of arr) {
      const mult = c.price / med;
      if (mult > MEDIAN_MULT) {
        flags.push({
          detector: "B",
          card: c,
          detail: `${mult.toFixed(0)}x the ${key} median $${med.toFixed(2)} (n=${arr.length}, limit ${MEDIAN_MULT}x)`,
        });
      }
    }
  }

  // C · base-bucket absolute ceiling
  for (const c of included) {
    if (bucketOf(c.id) !== "base") continue;
    if (c.price > BASE_ABS_CEILING) {
      flags.push({
        detector: "C",
        card: c,
        detail: `plain-id card at $${c.price} above the $${BASE_ABS_CEILING} base-bucket ceiling`,
      });
    }
  }

  return flags;
}

function printFlags(flags) {
  for (const f of flags) {
    const c = f.card;
    console.log(
      `  [${f.detector}] ${c.id} | ${c.set ?? "-"} | ${c.rarity ?? "-"} | $${c.price} | ${c.name} — ${f.detail}`
    );
  }
}

// -- run ---------------------------------------------------------------------

// The audit proper always runs on the real classifier verdicts.
const baselineIncluded = catalog.filter((c) =>
  classifyBoosterBaseline({ cardImageId: c.id, name: c.name, rarity: c.rarity }).included
);
const auditFlags = runDetectors(baselineIncluded);

console.log(`\nAudit (${baselineIncluded.length} included baseline cards): ${auditFlags.length} flag(s)`);
printFlags(auditFlags);

let failed = auditFlags.length > 0;

if (selftest) {
  console.log("\nSelftest — re-including the four known leaks:");
  const withControls = catalog.filter(isIncluded);
  const selftestFlags = runDetectors(withControls);
  for (const id of SELFTEST_CONTROL_IDS) {
    const hits = selftestFlags.filter((f) => f.card.id === id);
    const present = catalog.some((c) => c.id === id);
    if (!present) {
      console.log(`  MISSING ${id} — control not in the priced catalog (id churn? re-evidence it)`);
      failed = true;
    } else if (hits.length === 0) {
      console.log(`  MISSED  ${id} — control re-included but no detector flagged it`);
      failed = true;
    } else {
      console.log(
        `  CAUGHT  ${id} via ${[...new Set(hits.map((h) => h.detector))].join("+")} — ${hits[0].detail}`
      );
    }
  }
  const nonControl = selftestFlags.filter((f) => !SELFTEST_CONTROL_IDS.includes(f.card.id));
  if (nonControl.length !== auditFlags.length) {
    console.log(`  NOTE: control re-inclusion shifted ${Math.abs(nonControl.length - auditFlags.length)} unrelated flag(s) (median drift)`);
  }
}

console.log(`\nResult: ${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);
