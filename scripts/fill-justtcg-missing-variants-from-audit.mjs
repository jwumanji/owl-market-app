// Fill missing cards.variant_label values from the last successful
// catalog-audit-report.md JustTCG Missing Variant Labels section.
//
// This is intentionally conservative:
// - reads cached audit output, not the live JustTCG API
// - skips card_image_ids with conflicting expected variant labels
// - updates only existing rows whose variant_label is currently null
// - does not touch names, set assignment, rarity, images, prices, or tcg ids
//
// Default mode is a dry run. Use --apply to write updates.

import fs from "node:fs";

const REPORT_PATH = "catalog-audit-report.md";
const APPLY = process.argv.includes("--apply");

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
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

function parseTableRow(line) {
  if (!line.startsWith("|") || line.includes("---")) return null;
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  if (cells.length !== 6 || cells[0] === "Set") return null;
  return {
    set: cells[0],
    cardNumber: cells[1],
    name: cells[2],
    cardImageId: cells[3],
    variantLabel: cells[4],
    rarity: cells[5],
  };
}

function readMissingVariantRows() {
  const text = fs.readFileSync(REPORT_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## JustTCG Missing Variant Labels");
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    const row = parseTableRow(lines[i]);
    if (row) rows.push(row);
  }
  return rows;
}

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: restHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Supabase ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function patchVariantLabel(id, variantLabel) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(id)}&variant_label=is.null`, {
    method: "PATCH",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({ variant_label: variantLabel }),
  });
  if (!res.ok) {
    throw new Error(`Supabase variant_label patch failed: ${res.status} ${await res.text()}`);
  }
}

function mdTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return out.join("\n");
}

async function main() {
  const rows = readMissingVariantRows();
  const byImageId = new Map();
  for (const row of rows) {
    const bucket = byImageId.get(row.cardImageId) ?? [];
    bucket.push(row);
    byImageId.set(row.cardImageId, bucket);
  }

  const conflicts = [];
  const desired = [];
  for (const [cardImageId, group] of byImageId.entries()) {
    const labels = new Set(group.map((row) => row.variantLabel).filter(Boolean));
    if (labels.size !== 1) {
      conflicts.push({ cardImageId, labels: Array.from(labels), rows: group });
      continue;
    }
    desired.push({
      ...group[0],
      variantLabel: Array.from(labels)[0],
    });
  }

  const existing = [];
  for (const row of desired) {
    const cards = await sbFetch(
      `cards?select=id,card_image_id,card_number,name,variant_label,rarity&card_image_id=eq.${encodeURIComponent(row.cardImageId)}`
    );
    if (cards.length === 1) {
      existing.push({ audit: row, card: cards[0] });
    }
  }

  const updates = existing.filter(({ card }) => card.variant_label == null);
  const skippedAlreadyFilled = existing.filter(({ card }) => card.variant_label != null);

  const report = [];
  report.push("# JustTCG Cached Missing Variant Fill Report");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["Cached audit rows read", rows.length],
      ["Unique card_image_ids", byImageId.size],
      ["Conflicting card_image_ids skipped", conflicts.length],
      ["Existing DB rows found", existing.length],
      ["Rows already filled", skippedAlreadyFilled.length],
      ["Rows to update", updates.length],
    ]
  ));
  report.push("");
  report.push("## Updates");
  report.push("");
  report.push(mdTable(
    ["card_image_id", "Card #", "Name", "Variant"],
    updates.map(({ audit, card }) => [card.card_image_id, card.card_number, card.name, audit.variantLabel])
  ));
  report.push("");
  if (conflicts.length > 0) {
    report.push("## Conflicts Skipped");
    report.push("");
    report.push(mdTable(
      ["card_image_id", "Labels"],
      conflicts.map((conflict) => [conflict.cardImageId, conflict.labels.join(", ")])
    ));
    report.push("");
  }

  fs.writeFileSync("justtcg-missing-variant-fill-report.md", `${report.join("\n")}\n`);

  console.log(`Rows to update: ${updates.length}`);
  console.log(`Conflicts skipped: ${conflicts.length}`);
  console.log("Wrote justtcg-missing-variant-fill-report.md");

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to fill null variant_label values.");
    return;
  }

  for (const { audit, card } of updates) {
    await patchVariantLabel(card.id, audit.variantLabel);
  }
  console.log("Apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
