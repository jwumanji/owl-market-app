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
const pagePath = path.resolve("src/app/admin/inventory/page.tsx");
const pageSource = fs.readFileSync(pagePath, "utf8");
const pageJavaScript = ts.transpileModule(pageSource, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const tabsPath = path.resolve("src/app/admin/inventory/InventoryTabs.tsx");
const tabsSource = fs.readFileSync(tabsPath, "utf8");
const tabsJavaScript = ts.transpileModule(tabsSource, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type CenteringCeiling = "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";

type InventoryShellProps = {
  items: Array<{ id: string; centering_ceiling?: CenteringCeiling | null }>;
  initialPsa10CandidatesOnly?: boolean;
};

type QueryCall = {
  table: string;
  column?: string;
  value?: unknown;
  columns?: string;
};

function inventoryItem(id: string, ceiling?: CenteringCeiling | null) {
  return {
    id,
    created_at: "2026-05-15T00:00:00.000Z",
    card_id: `card-${id}`,
    manual_card_name: null,
    manual_card_number: null,
    manual_set_code: null,
    catalog_match_status: "matched",
    item_nickname: null,
    pending_card_match: false,
    inventory_type: "raw",
    status: "new",
    quantity: 1,
    graded_rating: null,
    certification_number: null,
    custom_image_front_url: null,
    custom_image_back_url: null,
    customer_name: null,
    shipping_tracking: null,
    shipping_label_url: null,
    shipped_at: null,
    sale_channel: null,
    sold_date: null,
    sold_price: null,
    acquired_at: null,
    cost_basis: null,
    purchased_from: null,
    notes: null,
    inventory_centering_latest: ceiling ? [{ psa_ceiling: ceiling }] : [],
  };
}

function cardForInventoryItem(row: ReturnType<typeof inventoryItem>) {
  return {
    id: row.card_id,
    name: `Card ${row.id}`,
    image_url: null,
    image_url_small: null,
    card_number: "OP01-001",
    sets: { code: "OP01" },
  };
}

function makeThenableQuery<T>(resultFactory: () => { data: T[]; error: null }) {
  const query = {
    select(_columns: string) {
      return query;
    },
    eq(_column: string, _value: string) {
      return query;
    },
    in(_column: string, _values: string[]) {
      return query;
    },
    order(_column: string, _options?: { ascending?: boolean }) {
      return query;
    },
    then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(resultFactory()).then(onfulfilled, onrejected);
    },
  };

  return query;
}

function loadPage(rows = [
  inventoryItem("psa10", "PSA_10"),
  inventoryItem("psa9", "PSA_9"),
  inventoryItem("unmeasured", null),
]) {
  const calls: QueryCall[] = [];
  const shellProps: InventoryShellProps[] = [];
  const cards = new Map(rows.map((row) => [row.card_id, cardForInventoryItem(row)]));

  const supabase = {
    from(table: string) {
      if (table === "inventory_items") {
        const filters: QueryCall[] = [];
        const query = makeThenableQuery(() => {
          const hasPsa10Filter = filters.some(
            (call) => call.column === "inventory_centering_latest.psa_ceiling" && call.value === "PSA_10"
          );
          return {
            data: hasPsa10Filter
              ? rows.filter((row) => row.inventory_centering_latest[0]?.psa_ceiling === "PSA_10")
              : rows,
            error: null,
          };
        });

        return {
          ...query,
          select(columns: string) {
            calls.push({ table, columns });
            return this;
          },
          eq(column: string, value: string) {
            const call = { table, column, value };
            filters.push(call);
            calls.push(call);
            return this;
          },
        };
      }

      if (table === "cards") {
        let ids: string[] = [];
        const query = makeThenableQuery(() => ({
          data: ids.map((id) => cards.get(id)).filter(Boolean) as ReturnType<typeof cardForInventoryItem>[],
          error: null,
        }));

        return {
          ...query,
          select(columns: string) {
            calls.push({ table, columns });
            return this;
          },
          in(column: string, values: string[]) {
            calls.push({ table, column, value: values });
            ids = values;
            return this;
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mocks: Record<string, unknown> = {
    "./InventoryShell": {
      __esModule: true,
      default(props: InventoryShellProps) {
        shellProps.push(props);
        return React.createElement(
          "div",
          {
            "data-testid": "inventory-shell",
            "data-candidate-filter": String(props.initialPsa10CandidatesOnly),
          },
          props.items.map((item) => `${item.id}:${item.centering_ceiling ?? "none"}`).join("|")
        );
      },
    },
    "../orders/order-data": {
      loadOrderSummaries() {
        return Promise.resolve({ data: [], error: null });
      },
    },
    "@/lib/inventory-options": {
      CATALOG_MATCH_STATUSES: ["matched", "needs_match", "custom_verified"],
    },
    "@/lib/supabase-server": {
      createServiceClient() {
        return supabase;
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
        searchParams?: { centering?: string; status?: string };
      }) => Promise<React.ReactElement>;
    },
  };
  const context = vm.createContext({
    console,
    exports: moduleStub.exports,
    module: moduleStub,
    process,
    require: localRequire,
  });

  vm.runInContext(pageJavaScript, context, { filename: pagePath });

  return {
    Page: moduleStub.exports.default,
    calls,
    shellProps,
  };
}

function loadInventoryTabsHelpers() {
  const mocks: Record<string, unknown> = {
    "@/lib/customer-orders": {
      displayCustomerOrderNumber() {
        return "ORDER-1";
      },
    },
    "@/lib/inventory-options": {
      GRADED_RATINGS: ["PSA 10", "PSA 9", "BGS 9.5"],
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
      renderCenteringCeilingBadge: (ceiling?: CenteringCeiling | null) => React.ReactNode;
      shouldShowItemForPsa10Candidates: (
        item: { centering_ceiling?: CenteringCeiling | null },
        enabled: boolean
      ) => boolean;
    },
  };
  const context = vm.createContext({
    console,
    exports: moduleStub.exports,
    module: moduleStub,
    process,
    require: localRequire,
  });

  vm.runInContext(tabsJavaScript, context, { filename: tabsPath });
  return moduleStub.exports;
}

test("inventory page leaves PSA 10 candidate filter off and attaches latest centering ceilings", async () => {
  const { Page, calls, shellProps } = loadPage();

  const element = await Page({});
  const html = renderToStaticMarkup(element);

  assert.match(html, /data-candidate-filter="false"/);
  assert.deepEqual(shellProps[0].items.map((item) => `${item.id}:${item.centering_ceiling ?? "none"}`), [
    "psa10:PSA_10",
    "psa9:PSA_9",
    "unmeasured:none",
  ]);
  assert.ok(calls.some((call) => call.columns?.includes("inventory_centering_latest(psa_ceiling)")));
  assert.ok(!calls.some((call) => call.column === "inventory_centering_latest.psa_ceiling"));
});

test("inventory page applies PSA 10 candidate filter with an inner latest-view join", async () => {
  const { Page, calls, shellProps } = loadPage();

  const element = await Page({ searchParams: { centering: "psa10" } });
  const html = renderToStaticMarkup(element);

  assert.match(html, /data-candidate-filter="true"/);
  assert.deepEqual(shellProps[0].items.map((item) => item.id), ["psa10"]);
  assert.ok(calls.some((call) => call.columns?.includes("inventory_centering_latest!inner(psa_ceiling)")));
  assert.ok(
    calls.some((call) => call.column === "inventory_centering_latest.psa_ceiling" && call.value === "PSA_10")
  );
});

test("inventory centering badge renders only when a latest measurement exists", () => {
  const helpers = loadInventoryTabsHelpers();

  const badgeHtml = renderToStaticMarkup(
    React.createElement(React.Fragment, null, helpers.renderCenteringCeilingBadge("PSA_10"))
  );
  const absentBadge = helpers.renderCenteringCeilingBadge(null);

  assert.match(badgeHtml, /PSA 10/);
  assert.match(badgeHtml, /text-gain/);
  assert.equal(absentBadge, null);
  assert.equal(helpers.shouldShowItemForPsa10Candidates({ centering_ceiling: "PSA_10" }, true), true);
  assert.equal(helpers.shouldShowItemForPsa10Candidates({ centering_ceiling: "PSA_9" }, true), false);
  assert.equal(helpers.shouldShowItemForPsa10Candidates({ centering_ceiling: null }, false), true);
});
