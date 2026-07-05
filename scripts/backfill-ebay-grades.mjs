// One-off backfill: re-parse ebay_sales titles with the current parseGrade
// (src/lib/ebay-stats.ts — the exact shipped logic, transpiled at runtime)
// and update grader / grade / sale_type where the parse differs.
//
//   node scripts/backfill-ebay-grades.mjs           # dry run — report only
//   node scripts/backfill-ebay-grades.mjs --apply   # write the changes
//
// Rows with a null/empty title are never touched: a missing title can't
// prove a stored grade wrong.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000;
const PATCH_CHUNK = 100;

function loadEnvFile(envPath = ".env.local") {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

function restHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

// Load parseGrade from the TS source so the backfill can never drift from
// what the sync route ships.
function loadParseGrade() {
  const statsPath = path.resolve("src/lib/ebay-stats.ts");
  const js = ts.transpileModule(fs.readFileSync(statsPath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleStub = { exports: {} };
  vm.runInContext(
    js,
    vm.createContext({ exports: moduleStub.exports, module: moduleStub, require }),
    { filename: statsPath }
  );
  if (typeof moduleStub.exports.parseGrade !== "function") {
    throw new Error("parseGrade not exported from src/lib/ebay-stats.ts");
  }
  return moduleStub.exports.parseGrade;
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    select: "id,title,grader,grade,sale_type",
    order: "id.asc",
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ebay_sales?${params}`, {
    headers: restHeaders(),
  });
  if (!res.ok) throw new Error(`fetch page @${offset}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchRows(ids, target) {
  const filter = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ebay_sales?id=in.${encodeURIComponent(filter)}`,
    {
      method: "PATCH",
      headers: restHeaders({ "Content-Type": "application/json", Prefer: "count=exact" }),
      body: JSON.stringify(target),
    }
  );
  if (!res.ok) throw new Error(`patch: ${res.status} ${await res.text()}`);
  const range = res.headers.get("content-range");
  return range ? Number(range.split("/")[1]) : ids.length;
}

function categorize(oldRow, parsed) {
  const wasGraded = oldRow.grader != null;
  const isGraded = parsed.grader != null;
  if (!wasGraded && isGraded) return "raw→graded";
  if (wasGraded && !isGraded) return "graded→raw";
  if (oldRow.grader !== parsed.grader) return "grader changed";
  if (Number(oldRow.grade) !== parsed.grade) return "grade changed";
  return "sale_type only";
}

const parseGrade = loadParseGrade();

let scanned = 0;
let untitled = 0;
const changes = []; // { id, title, old, parsed, category }

for (let offset = 0; ; offset += PAGE_SIZE) {
  const rows = await fetchPage(offset);
  for (const row of rows) {
    scanned += 1;
    if (!row.title || !row.title.trim()) {
      untitled += 1;
      continue;
    }
    const parsed = parseGrade(row.title);
    const gradeChanged =
      (row.grade == null ? null : Number(row.grade)) !== parsed.grade;
    if (row.grader !== parsed.grader || gradeChanged || row.sale_type !== parsed.sale_type) {
      changes.push({ id: row.id, title: row.title, old: row, parsed, category: categorize(row, parsed) });
    }
  }
  if (rows.length < PAGE_SIZE) break;
}

const byCategory = new Map();
const byNewGrader = new Map();
for (const change of changes) {
  byCategory.set(change.category, (byCategory.get(change.category) ?? 0) + 1);
  if (change.parsed.grader) {
    byNewGrader.set(change.parsed.grader, (byNewGrader.get(change.parsed.grader) ?? 0) + 1);
  }
}

console.log(`mode:            ${APPLY ? "APPLY" : "dry run"}`);
console.log(`rows scanned:    ${scanned}`);
console.log(`null/empty title (skipped): ${untitled}`);
console.log(`rows to change:  ${changes.length}`);
for (const [category, count] of byCategory) console.log(`  ${category}: ${count}`);
if (byNewGrader.size > 0) {
  console.log("new grader values among changes:");
  for (const [grader, count] of byNewGrader) console.log(`  ${grader}: ${count}`);
}
if (changes.length > 0) {
  console.log("\nsample (up to 10):");
  for (const change of changes.slice(0, 10)) {
    const oldLabel = change.old.grader ? `${change.old.grader} ${change.old.grade}` : "raw";
    const newLabel = change.parsed.grader ? `${change.parsed.grader} ${change.parsed.grade}` : "raw";
    console.log(`  [${change.category}] ${oldLabel} → ${newLabel} :: ${change.title.slice(0, 90)}`);
  }
}

// process.exit() here trips a libuv teardown assertion on Windows with the
// vm/typescript handles still open — fall through to a natural exit instead.
if (APPLY && changes.length > 0) {
  // Group by identical target values so each PATCH updates a whole cohort.
  const groups = new Map();
  for (const change of changes) {
    const key = JSON.stringify(change.parsed);
    if (!groups.has(key)) groups.set(key, { target: change.parsed, ids: [] });
    groups.get(key).ids.push(change.id);
  }

  let updated = 0;
  for (const { target, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += PATCH_CHUNK) {
      updated += await patchRows(ids.slice(i, i + PATCH_CHUNK), {
        grader: target.grader,
        grade: target.grade,
        sale_type: target.sale_type,
      });
    }
  }

  console.log(`\nrows updated: ${updated}`);
  if (updated !== changes.length) {
    console.warn(`WARNING: expected ${changes.length} updates but PATCH reported ${updated}`);
  }
} else if (!APPLY && changes.length > 0) {
  console.log("\ndry run — re-run with --apply to write.");
}
