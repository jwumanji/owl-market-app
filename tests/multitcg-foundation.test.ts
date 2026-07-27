import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Node 24 executes erasable TypeScript directly, so these test-only imports use
// explicit extensions while application code continues using bundler paths.
import {
  canNormalizeProviderContract,
  JUSTTCG_PROVIDER_CONTRACTS,
} from "../src/lib/games/provider-contract.ts";
import { buildGradeKey, toPriceObservationRow } from "../src/lib/multitcg/pricing.ts";
import {
  justTcgObservedAt,
  normalizeProviderCondition,
  writeJustTcgShadowPrices,
} from "../src/lib/multitcg/justtcg-shadow-write.ts";
import {
  assertSafeMultiTcgRollout,
  getMultiTcgRolloutConfig,
} from "../src/lib/multitcg/rollout.ts";
import {
  acquireProviderSyncState,
  releaseProviderSyncState,
} from "../src/lib/provider-sync-state.ts";
import {
  classifyExpectedDifferences,
  stableJson,
  summarizeCardDifference,
} from "../scripts/lib/card-api-golden-utils.mjs";
import { enumerateGate4ExpectedDiffs } from "../scripts/lib/gate4-expected-diffs.mjs";

const MULTITCG_MIGRATIONS = [
  "20260719090000_multitcg_integrity_and_sync_scope.sql",
  "20260719093000_multitcg_catalog_foundation.sql",
  "20260719100000_multitcg_pricing_foundation.sql",
  "20260719113000_one_piece_treasure_rare_integrity.sql",
  "20260719114500_one_piece_tr_rarity_reference.sql",
];

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n+$/, "\n");
}

test("Gate 1 SQL bundle contains the five migrations verbatim in apply order", () => {
  const bundle = normalizeNewlines(
    fs.readFileSync(
      path.join(process.cwd(), "docs/reports/multitcg-gate1-sql-bundle.md"),
      "utf8"
    )
  );
  let priorBlockEnd = -1;

  for (const migration of MULTITCG_MIGRATIONS) {
    const marker = `## ${migration}\n\n\`\`\`sql\n`;
    const blockStart = bundle.indexOf(marker);
    assert.ok(blockStart > priorBlockEnd, `${migration} is missing or out of apply order`);
    const contentStart = blockStart + marker.length;
    const blockEnd = bundle.indexOf("\n```", contentStart);
    assert.ok(blockEnd > contentStart, `${migration} SQL fence is not closed`);

    const source = normalizeNewlines(
      fs.readFileSync(path.join(process.cwd(), "supabase/migrations", migration), "utf8")
    );
    // The closing-fence delimiter owns the newline immediately after the final
    // SQL line, so restore it before comparing with the source file.
    const bundledSql = normalizeNewlines(`${bundle.slice(contentStart, blockEnd)}\n`);
    assert.equal(bundledSql, source, `${migration} differs from its bundled SQL`);
    priorBlockEnd = blockEnd;
  }
});

test("hardening migration makes locks atomic and correlates pricing identities", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260720090000_multitcg_lock_and_relationship_integrity.sql"
    ),
    "utf8"
  );

  assert.match(sql, /create or replace function public\.acquire_provider_sync_state/);
  assert.match(sql, /on conflict \(game_id, catalog_scope, provider, provider_api_version, job_key, scope_key\)/);
  assert.match(sql, /scoped_release\.lock_owner = p_lock_owner/);
  assert.match(sql, /legacy_release\.lock_owner = p_lock_owner/);
  assert.doesNotMatch(sql, /^\s+and lock_owner = p_lock_owner;/m);
  assert.match(sql, /provider_skus_product_provider_game_fk/);
  assert.match(sql, /price_observations_sku_identity_fk/);
  assert.match(sql, /latest_price_facts_observation_identity_fk/);
  assert.match(sql, /preferred_card_prices_fact_variant_fk/);
  assert.match(sql, /sealed_product_price_history_product_game_fk/);
});

test("JustTCG cursor uses one-set invocations and deterministic keyset pagination", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/sync/justtcg/route.ts"),
    "utf8"
  );
  const vercel = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")
  ) as { crons: Array<{ path: string; schedule: string }> };
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260722133000_justtcg_cursor_loader_performance.sql"
    ),
    "utf8"
  );

  assert.match(route, /export const maxDuration = 300/);
  assert.match(route, /const LOCK_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(route, /const CURSOR_SETS_PER_INVOCATION = 1/);
  assert.match(route, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(route, /query\.gt\("id", afterId\)/);
  assert.doesNotMatch(route, /\.range\(offset, offset \+ PAGE - 1\)/);

  const onePiecePriceCrons = vercel.crons.filter((cron) =>
    cron.path.startsWith("/api/sync/justtcg?game=one_piece")
  );
  assert.equal(onePiecePriceCrons.length, 4);
  for (const cron of onePiecePriceCrons) {
    assert.match(cron.path, /[?&]maxSets=1(?:&|$)/);
    assert.doesNotMatch(cron.path, /[?&]maxSets=4(?:&|$)/);
  }

  assert.match(
    migration,
    /create index if not exists idx_cards_game_region_id\s+on public\.cards\(game_id, region, id\)/
  );
});

test("provider sync helper uses the atomic lock RPC when available", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "acquire_provider_sync_state") {
        return {
          data: [{
            state: { nextIndex: 3 },
            locked_at: "2026-07-20T00:00:00.000Z",
            lock_owner: String(args.p_lock_owner),
            acquired: true,
          }],
          error: null,
        };
      }
      return { data: true, error: null };
    },
  };
  const scope = {
    gameId: "game-id",
    provider: "justtcg",
    providerApiVersion: "v1",
    jobKey: "current_prices",
    legacyKey: "legacy-cursor",
  };

  const acquired = await acquireProviderSyncState({
    supabase,
    scope,
    lockTtlMs: 60_000,
    reset: false,
    resetState: () => ({ nextIndex: 0 }),
    normalizeState: (state: { nextIndex: number }) => state,
  });
  assert.equal(acquired.locked, false);
  assert.equal(acquired.state.nextIndex, 3);
  assert.ok(acquired.lockOwner);
  assert.equal(calls[0]?.name, "acquire_provider_sync_state");
  assert.equal(calls[0]?.args.p_lock_ttl_seconds, 60);

  assert.equal(await releaseProviderSyncState({
    supabase,
    scope,
    lockOwner: acquired.lockOwner!,
    state: acquired.state,
  }), null);
  assert.equal(calls[1]?.name, "release_provider_sync_state");
});

test("JustTCG v1 is normalized while v2 beta remains raw-only", () => {
  assert.equal(canNormalizeProviderContract(JUSTTCG_PROVIDER_CONTRACTS.normalized), true);
  assert.equal(canNormalizeProviderContract(JUSTTCG_PROVIDER_CONTRACTS.beta), false);
});

test("grade keys distinguish labeled tens from ordinary tens", () => {
  const blackLabel = buildGradeKey({
    gradeCompany: "BGS",
    gradeValue: 10,
    gradeLabel: "Black Label",
    gradeTierCode: "BLACK_LABEL",
  });
  const pristine = buildGradeKey({
    gradeCompany: "BGS",
    gradeValue: 10,
    gradeLabel: "Pristine 10",
    gradeTierCode: "PRISTINE_10",
  });
  const ordinary = buildGradeKey({
    gradeCompany: "BGS",
    gradeValue: 10,
    gradeLabel: null,
    gradeTierCode: "BGS_10",
  });

  assert.notEqual(blackLabel, pristine);
  assert.notEqual(blackLabel, ordinary);
  assert.notEqual(pristine, ordinary);
  assert.equal(
    buildGradeKey({ gradeCompany: null, gradeValue: null, gradeLabel: null, gradeTierCode: null }),
    "ungraded"
  );
});

test("price observation rows preserve provider and market dimensions", () => {
  const row = toPriceObservationRow({
    gameId: "game-id",
    commercialVariantId: "variant-id",
    providerId: "provider-id",
    providerSkuId: "sku-id",
    externalObservationKey: "variant-id:2026-07-19T00:00:00Z",
    marketCode: "us-retail",
    marketRegionCode: "US",
    currencyCode: "USD",
    conditionCode: "near_mint",
    priceType: "true_market",
    amount: 12.34,
    observedAt: "2026-07-19T00:00:00Z",
  });

  assert.equal(row.price_type, "true_market");
  assert.equal(row.market_code, "us-retail");
  assert.equal(row.provider_sku_id, "sku-id");
  assert.equal(row.observed_at, "2026-07-19T00:00:00.000Z");
});

test("invalid price observations fail before reaching the database", () => {
  assert.throws(
    () => toPriceObservationRow({
      gameId: "game-id",
      commercialVariantId: "variant-id",
      providerId: "provider-id",
      externalObservationKey: "bad-price",
      marketCode: "global",
      currencyCode: "usd",
      conditionCode: "near_mint",
      priceType: "market",
      amount: -1,
      observedAt: "invalid",
    }),
    /non-negative/
  );
});

test("JustTCG shadow normalization is deterministic and does not use True Market", () => {
  assert.equal(normalizeProviderCondition("Near Mint"), "near_mint");
  assert.equal(justTcgObservedAt(1_752_883_200), "2025-07-19T00:00:00.000Z");
  assert.equal(justTcgObservedAt(1_752_883_200_000), "2025-07-19T00:00:00.000Z");
});

test("JustTCG shadow writes use one transactional batch and an ingest run", async () => {
  const calls: Array<{ operation: string; value?: unknown }> = [];
  const updateChain = {
    eq() {
      return this;
    },
    then(resolve: (value: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  const supabase = {
    from(table: string) {
      if (table === "data_providers") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: "provider-id",
                      is_active: true,
                      normalized_api_version: "v1",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "source_ingest_runs") {
        return {
          insert: async (value: unknown) => {
            calls.push({ operation: "insert-run", value });
            return { error: null };
          },
          update: (value: unknown) => {
            calls.push({ operation: "update-run", value });
            return updateChain;
          },
        };
      }
      throw new Error("Unexpected table " + table);
    },
    rpc: async (name: string, value: unknown) => {
      calls.push({ operation: name, value });
      return {
        data: {
          attempted: 1,
          observations_written: 1,
          preferred_prices_written: 1,
        },
        error: null,
      };
    },
  };

  const result = await writeJustTcgShadowPrices({
    supabase,
    gameId: "game-id",
    sourceCatalogKey: "one-piece-card-game",
    matches: [{
      legacyCardId: "legacy-card-id",
      providerProductExternalId: "product-id",
      providerProductNamespace: "product_id",
      providerSkuExternalId: "sku-id",
      providerSkuNamespace: "variant_id",
      condition: "Near Mint",
      printing: "Normal",
      amount: 12.34,
      observedAt: "2026-07-20T00:00:00.000Z",
      sourceSetSlug: "op-01",
      rawProduct: { id: "product-id" },
      rawVariant: { id: "sku-id" },
    }],
  });

  assert.equal(result.observationsWritten, 1);
  assert.equal(result.preferredPricesWritten, 1);
  assert.ok(result.ingestRunId);
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["insert-run", "write_justtcg_shadow_price_batch", "update-run"]
  );
});

test("rollout defaults to legacy reads and blocks an unsafe direct cutover", () => {
  assert.deepEqual(getMultiTcgRolloutConfig({} as NodeJS.ProcessEnv), {
    dualWriteEnabled: false,
    readMode: "legacy",
  });
  assert.throws(
    () => getMultiTcgRolloutConfig({
      NODE_ENV: "test",
      MULTITCG_DUAL_WRITE_ENABLED: "0",
      MULTITCG_READ_MODE: "preferred_projection",
    } as NodeJS.ProcessEnv),
    /requires MULTITCG_DUAL_WRITE_ENABLED=1/
  );
  assert.throws(
    () => getMultiTcgRolloutConfig({
      NODE_ENV: "test",
      MULTITCG_DUAL_WRITE_ENABLED: "0",
      MULTITCG_READ_MODE: "shadow_compare",
    } as NodeJS.ProcessEnv),
    /requires MULTITCG_DUAL_WRITE_ENABLED=1/
  );
  assert.doesNotThrow(() => assertSafeMultiTcgRollout({
    dualWriteEnabled: true,
    readMode: "preferred_projection",
  }));
});

test("golden comparison ignores object key order but detects response-section changes", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  assert.deepEqual(
    summarizeCardDifference(
      { extras: { ebay: 1 }, history: [{ price: 2 }] },
      { extras: { ebay: 2 }, history: [{ price: 2 }] }
    ),
    ["extras"]
  );
});

test("Gate 6 golden comparison ignores expected price writes but retains identity", () => {
  const expected = {
    extras: {
      ebayRecent: [{ ebay_url: "https://example.test/item-1", sale_price: 10 }],
      ebayStats: { rawAvg: null, rawCount: 0, tiers: { PSA_10: { avg: null, count: 0 } } },
      jpPrice: { price_jpy: 1000, snapshot_date: "2026-07-19", source_url: "https://example.test/jp" },
    },
    history: {
      priceHistory: [{ market_avg: 10, recorded_at: "2026-07-18", tcg_market: 10 }],
      priceHistorySynthetic: false,
    },
  };
  const afterPriceWrite = {
    extras: {
      ebayRecent: [{ ebay_url: "https://example.test/item-1", sale_price: 12 }],
      ebayStats: { rawAvg: 12, rawCount: 1, tiers: { PSA_10: { avg: 12, count: 1 } } },
      jpPrice: { price_jpy: 1200, snapshot_date: "2026-07-19", source_url: "https://example.test/jp" },
    },
    history: {
      priceHistory: [
        { market_avg: 10, recorded_at: "2026-07-18", tcg_market: 10 },
        { market_avg: 12, recorded_at: "2026-07-19", tcg_market: 12 },
      ],
      priceHistorySynthetic: false,
    },
  };

  assert.deepEqual(summarizeCardDifference(expected, afterPriceWrite, "shape_identity"), []);
  assert.deepEqual(summarizeCardDifference(expected, afterPriceWrite, "exact"), ["extras", "history"]);

  afterPriceWrite.extras.ebayRecent[0].ebay_url = "https://example.test/wrong-item";
  assert.deepEqual(
    summarizeCardDifference(expected, afterPriceWrite, "shape_identity"),
    ["extras"]
  );
});

test("Gate 4 allowlist classifies only enumerated card differences as expected", () => {
  assert.deepEqual(
    classifyExpectedDifferences(
      [
        { id: "OP07-109_p2", sections: ["extras"] },
        { id: "OTHER", sections: ["history"] },
      ],
      new Set(["OP07-109_p2"])
    ),
    [
      { id: "OP07-109_p2", sections: ["extras"], status: "EXPECTED" },
      { id: "OTHER", sections: ["history"], status: "UNEXPECTED" },
    ]
  );
});

test("Gate 4 enumeration models both TR migrations in apply order", () => {
  const game = { id: "game", slug: "one_piece" };
  const rows = enumerateGate4ExpectedDiffs({
    game,
    sets: [{ id: "set-op08", game_id: "game", code: "OP08" }],
    rarities: [{ id: "rarity-tr", game_id: "game", code: "TR" }],
    cards: [
      {
        id: "card",
        game_id: "game",
        set_id: "set-op08",
        card_image_id: "OP07-109_p2",
        name: "Monkey.D.Luffy (SP)",
        rarity: "SP",
        variant_label: "SP",
        rarity_id: "rarity-sp",
        region: "en",
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].selectors, [
    "20260719113000.corrected_cards",
    "20260719114500.tr_reference_reconcile",
  ]);
  assert.deepEqual(rows[0].expectedChanges, {
    name: { before: "Monkey.D.Luffy (SP)", after: "Monkey.D.Luffy (TR)" },
    rarity: { before: "SP", after: "TR" },
    variant_label: { before: "SP", after: "TR" },
    rarity_id: { before: "rarity-sp", after: "rarity-tr" },
  });
});
