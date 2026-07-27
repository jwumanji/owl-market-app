import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260723120000_market_index_snapshots.sql"
);
const routePath = path.join(
  process.cwd(),
  "src/app/api/sync/market-index-snapshots/route.ts"
);

test("market index snapshots persist private idempotent 7D and 30D history", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /create table if not exists public\.market_index_snapshots/);
  assert.match(sql, /unique \(game_id, entity_type, entity_key, snapshot_date\)/);
  assert.match(sql, /create or replace function public\.capture_market_index_snapshots/);
  assert.match(sql, /perform public\.refresh_public_game_summaries\(p_game_id\)/);
  assert.match(sql, /on conflict \(game_id, entity_type, entity_key, snapshot_date\)/);
  assert.match(sql, /\bchg_7d numeric,/);
  assert.match(sql, /\bchg_30d numeric,/);
  assert.match(sql, /'market_avg_then_tcg_market'/);
  assert.match(sql, /'tcg_market'/);
  assert.match(sql, /when upper\(trim\(coalesce\(cards\.printed_set_code, ''\)\)\) = 'N' then 'P'/);
  assert.match(sql, /alter table public\.market_index_snapshots enable row level security/);
  assert.match(
    sql,
    /revoke all on table public\.market_index_snapshots from anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.capture_market_index_snapshots\(uuid, date\)\s+to service_role/
  );
  assert.match(sql, /create extension if not exists pg_cron with schema pg_catalog/);
  assert.match(sql, /where jobname = 'one-piece-market-index-snapshots'/);
  assert.match(sql, /'40 23 \* \* 0'/);
  assert.match(sql, /select public\.capture_market_index_snapshots/);
});

test("snapshot sync endpoint authenticates before invoking the capture RPC", () => {
  const route = fs.readFileSync(routePath, "utf8");
  const authIndex = route.indexOf("authorizeInternalRequest(request)");
  const rpcIndex = route.indexOf('.rpc("capture_market_index_snapshots"');

  assert.ok(authIndex >= 0);
  assert.ok(rpcIndex > authIndex);
  assert.match(route, /const ISO_DATE = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(route, /p_snapshot_date: snapshotDate/);
});
