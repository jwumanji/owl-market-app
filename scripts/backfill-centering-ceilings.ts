import { existsSync, readFileSync } from "node:fs";
import {
  bgsCeilingBack,
  bgsCeilingFront,
  tagCeilingBack,
  tagCeilingFront,
  type BgsGrade,
  type TagGrade,
} from "../src/lib/centering-math";
import { createServiceClient } from "../src/lib/supabase-server";

type CenteringFace = "front" | "back";

type CenteringMeasurementRow = {
  id: string;
  created_at: string | null;
  inventory_item_id: string | null;
  card_identity: string | null;
  face: string | null;
  worst_axis_max_pct: string | number | null;
  psa_ceiling: string | null;
  bgs_ceiling: string | null;
  tag_ceiling: string | null;
};

type PlannedBackfill = CenteringMeasurementRow & {
  face: CenteringFace;
  worstAxisMaxPct: number;
  computed_bgs_ceiling: BgsGrade;
  computed_tag_ceiling: TagGrade;
};

const SELECT_COLUMNS = [
  "id",
  "created_at",
  "inventory_item_id",
  "card_identity",
  "face",
  "worst_axis_max_pct",
  "psa_ceiling",
  "bgs_ceiling",
  "tag_ceiling",
].join(", ");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const SAMPLE_LIMIT = readNumberArg("--sample", 10);
const BATCH_SIZE = readNumberArg("--batch-size", 100);

function readNumberArg(name: string, fallback: number) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;

  const parsed = Number(arg.slice(prefix.length));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const delimiter = trimmed.indexOf("=");
    if (delimiter < 0) continue;

    const key = trimmed.slice(0, delimiter).trim();
    const value = trimmed
      .slice(delimiter + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function numeric(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFace(value: string | null): CenteringFace {
  if (value === "front" || value === "back") return value;
  throw new Error(`Unexpected centering face: ${value ?? "NULL"}`);
}

function planRow(row: CenteringMeasurementRow): PlannedBackfill {
  const face = parseFace(row.face);
  const worstAxisMaxPct = numeric(row.worst_axis_max_pct);

  if (worstAxisMaxPct === null) {
    throw new Error(`Row ${row.id} has no numeric worst_axis_max_pct.`);
  }

  return {
    ...row,
    face,
    worstAxisMaxPct,
    computed_bgs_ceiling:
      face === "back" ? bgsCeilingBack(worstAxisMaxPct) : bgsCeilingFront(worstAxisMaxPct),
    // Owl Lens is One Piece for this slice, so TAG uses the TCG category just like the write routes.
    computed_tag_ceiling:
      face === "back" ? tagCeilingBack(worstAxisMaxPct, "tcg") : tagCeilingFront(worstAxisMaxPct, "tcg"),
  };
}

function sampleForPrint(row: PlannedBackfill) {
  return {
    id: row.id,
    created_at: row.created_at,
    face: row.face,
    worst_axis_max_pct: row.worstAxisMaxPct,
    psa_ceiling: row.psa_ceiling,
    current_bgs: row.bgs_ceiling,
    computed_bgs: row.computed_bgs_ceiling,
    current_tag: row.tag_ceiling,
    computed_tag: row.computed_tag_ceiling,
    card_identity: row.card_identity,
  };
}

function isMissingBackfillColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  return (
    maybeError.code === "42703" &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes("bgs_ceiling")
  );
}

async function fetchDryRunSample(supabase: ReturnType<typeof createServiceClient>) {
  return supabase
    .from("centering_measurements")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("bgs_ceiling", null)
    .order("created_at", { ascending: true })
    .range(0, SAMPLE_LIMIT - 1);
}

async function fetchAllCandidates(supabase: ReturnType<typeof createServiceClient>) {
  const rows: CenteringMeasurementRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("centering_measurements")
      .select(SELECT_COLUMNS)
      .is("bgs_ceiling", null)
      .order("created_at", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as CenteringMeasurementRow[];
    rows.push(...page);

    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function applyBackfill(supabase: ReturnType<typeof createServiceClient>, plannedRows: PlannedBackfill[]) {
  let updated = 0;

  for (const row of plannedRows) {
    const { data, error } = await supabase
      .from("centering_measurements")
      .update({
        bgs_ceiling: row.computed_bgs_ceiling,
        tag_ceiling: row.computed_tag_ceiling,
      })
      .eq("id", row.id)
      .is("bgs_ceiling", null)
      .select("id");

    if (error) throw error;
    updated += data?.length ?? 0;
  }

  return updated;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabase = createServiceClient();

  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log("Predicate: centering_measurements.bgs_ceiling IS NULL");

  if (!APPLY) {
    const { data, count, error } = await fetchDryRunSample(supabase);
    if (error) {
      if (isMissingBackfillColumnError(error)) {
        console.error(
          "Missing bgs_ceiling on centering_measurements. Apply schema-migration-v34-centering-bgs-tag-ceilings.sql before running this backfill."
        );
      }
      throw error;
    }

    const sample = ((data ?? []) as unknown as CenteringMeasurementRow[]).map(planRow);
    console.log(`Rows that would be touched: ${count ?? 0}`);
    console.log(`Computed sample rows: ${sample.length}`);

    if (sample.length > 0) {
      console.table(sample.map(sampleForPrint));
    }

    console.log("Dry run only. Re-run with --apply after approval to write bgs_ceiling + tag_ceiling.");
    return;
  }

  const plannedRows = (await fetchAllCandidates(supabase)).map(planRow);
  console.log(`Rows planned for update: ${plannedRows.length}`);

  if (plannedRows.length === 0) {
    console.log("No rows need backfill.");
    return;
  }

  const updated = await applyBackfill(supabase, plannedRows);
  console.log(`Rows updated: ${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
