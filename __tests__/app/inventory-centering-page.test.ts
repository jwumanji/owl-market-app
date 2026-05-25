import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);
const pagePath = path.resolve("src/app/admin/inventory/[id]/centering/page.tsx");
const pageSource = fs.readFileSync(pagePath, "utf8");
const pageJavaScript = ts.transpileModule(pageSource, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type MeasurementRow = {
  id: string;
  created_at: string;
  left_pct: number;
  right_pct: number;
  top_pct: number;
  bottom_pct: number;
  worst_axis: "leftRight" | "topBottom";
  worst_axis_max_pct: number;
  psa_ceiling: "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";
  pipeline_mode: "mock" | "opencv";
  pipeline_version: string;
  processing_ms: number;
  manual_adjustment: boolean;
};

function baseItem() {
  return {
    id: "item-1",
    card_id: "card-1",
    manual_card_name: null,
    manual_card_number: null,
    manual_set_code: null,
    item_nickname: null,
    inventory_type: "raw",
    status: "new",
    quantity: 1,
    graded_rating: null,
    certification_number: null,
    custom_image_front_url: "https://cdn.example/front.jpg",
    custom_image_back_url: null,
  };
}

function baseCard() {
  return {
    id: "card-1",
    name: "Nami",
    card_number: "OP01-016",
    rarity: "R",
    image_url: null,
    image_url_small: null,
    sets: { code: "OP01", name: "Romance Dawn" },
  };
}

const onePieceGame = {
  id: "game-one-piece",
  slug: "one_piece",
  name: "One Piece Card Game",
  is_active: true,
  is_public: true,
  metadata: { route_slug: "one-piece" },
};

function measurement(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    id: "measurement-1",
    created_at: "2026-05-15T12:34:56.000Z",
    left_pct: 52,
    right_pct: 48,
    top_pct: 49,
    bottom_pct: 51,
    worst_axis: "leftRight",
    worst_axis_max_pct: 52,
    psa_ceiling: "PSA_10",
    pipeline_mode: "mock",
    pipeline_version: "0.1.0",
    processing_ms: 42,
    manual_adjustment: false,
    ...overrides,
  };
}

function loadPage({
  item = baseItem(),
  card = baseCard(),
  measurements = [],
  measurementCount = measurements.length,
}: {
  item?: ReturnType<typeof baseItem>;
  card?: ReturnType<typeof baseCard> | null;
  measurements?: MeasurementRow[];
  measurementCount?: number;
} = {}) {
  const ranges: { from: number; to: number }[] = [];

  const supabase = {
    from(table: string) {
      if (table === "games") {
        let matched = true;
        const query = {
          select(_columns: string) {
            return query;
          },
          eq(column: string, value: string) {
            if (column === "slug") {
              matched = value === onePieceGame.slug;
            } else if (column === "id") {
              matched = value === onePieceGame.id;
            }
            return query;
          },
          filter(column: string, _operator: string, value: string) {
            if (column === "metadata->>route_slug") {
              matched = value === onePieceGame.metadata.route_slug;
            }
            return query;
          },
          maybeSingle() {
            return Promise.resolve({ data: matched ? onePieceGame : null, error: null });
          },
        };
        return query;
      }

      if (table === "inventory_items") {
        let selectedId = "";
        let selectedGameId = "";
        const query = {
          select(_columns: string) {
            return query;
          },
          eq(column: string, value: string) {
            if (column === "id") {
              selectedId = value;
            } else if (column === "game_id") {
              selectedGameId = value;
            }
            return query;
          },
          async single() {
            return selectedId === item.id && selectedGameId === onePieceGame.id
              ? { data: item, error: null }
              : { data: null, error: { message: "not found" } };
          },
        };
        return query;
      }

      if (table === "cards") {
        const query = {
          select(_columns: string) {
            return query;
          },
          eq() {
            return query;
          },
          async single() {
            return card ? { data: card, error: null } : { data: null, error: { message: "not found" } };
          },
        };
        return query;
      }

      if (table === "centering_measurements") {
        const query = {
          select(_columns: string, _options?: { count?: string }) {
            return query;
          },
          eq() {
            return query;
          },
          order() {
            return query;
          },
          async range(from: number, to: number) {
            ranges.push({ from, to });
            return {
              data: measurements.slice(from, to + 1),
              error: null,
              count: measurementCount,
            };
          },
        };
        return query;
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mocks: Record<string, unknown> = {
    "@/components/centering/CenteringWorkspace": {
      __esModule: true,
      default(props: {
        gameSlug: string;
        inventoryItemId: string;
        preloadImageUrl?: string | null;
        cardIdentity: { name: string };
      }) {
        return React.createElement(
          "div",
          {
            "data-card": props.cardIdentity.name,
            "data-game": props.gameSlug,
            "data-item": props.inventoryItemId,
            "data-preload": props.preloadImageUrl ?? "",
            "data-testid": "centering-workspace",
          },
          `Workspace ${props.cardIdentity.name}`
        );
      },
    },
    "@/lib/supabase-server": {
      createServiceClient() {
        return supabase;
      },
    },
    "next/link": {
      __esModule: true,
      default(props: { href: string; children: React.ReactNode; className?: string }) {
        return React.createElement("a", { href: props.href, className: props.className }, props.children);
      },
    },
    "next/navigation": {
      notFound() {
        throw new Error("not found");
      },
    },
  };

  function localRequire(specifier: string) {
    if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
      return mocks[specifier];
    }

    return requireFromTest(specifier);
  }

  const moduleStub = {
    exports: {} as {
      default: (props: {
        params: { id: string };
        searchParams?: { measurementPage?: string };
      }) => Promise<React.ReactElement>;
    },
  };

  const context = vm.createContext({
    console,
    exports: moduleStub.exports,
    module: moduleStub,
    process,
    require: localRequire,
    URLSearchParams,
  });

  vm.runInContext(pageJavaScript, context, { filename: pagePath });

  return {
    Page: moduleStub.exports.default,
    ranges,
  };
}

test("inventory centering page renders workspace and empty history", async () => {
  const { Page, ranges } = loadPage({ measurements: [], measurementCount: 0 });

  const element = await Page({ params: { id: "item-1" } });
  const html = renderToStaticMarkup(element);

  assert.match(html, /Card Centering Measurement/);
  assert.match(html, /Workspace Nami/);
  assert.match(html, /data-game="one_piece"/);
  assert.match(html, /data-item="item-1"/);
  assert.match(html, /data-preload="https:\/\/cdn.example\/front.jpg"/);
  assert.match(html, /No centering measurements yet/);
  assert.deepEqual(ranges, [{ from: 0, to: 4 }]);
});

test("inventory centering page renders prior measurements with pagination", async () => {
  const rows = [
    measurement({ id: "measurement-1", psa_ceiling: "PSA_10" }),
    measurement({
      id: "measurement-2",
      created_at: "2026-05-14T10:00:00.000Z",
      left_pct: 60,
      right_pct: 40,
      psa_ceiling: "PSA_8",
      manual_adjustment: true,
      worst_axis_max_pct: 60,
    }),
  ];
  const { Page, ranges } = loadPage({ measurements: rows, measurementCount: 6 });

  const element = await Page({ params: { id: "item-1" }, searchParams: { measurementPage: "1" } });
  const html = renderToStaticMarkup(element);

  assert.match(html, /PSA_10/);
  assert.match(html, /52\.00% \/ 48\.00%/);
  assert.match(html, /PSA_8/);
  assert.match(html, /Manual/);
  assert.match(html, /Next measurements/);
  assert.match(html, /measurementPage=2/);
  assert.match(html, /Page 1 of 2/);
  assert.deepEqual(ranges, [{ from: 0, to: 4 }]);
});
