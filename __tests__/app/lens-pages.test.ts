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

function transpile(filePath: string) {
  return ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function linkMock(props: { href: string; children: React.ReactNode; className?: string }) {
  return React.createElement("a", { href: props.href, className: props.className }, props.children);
}

test("lens hub renders all tool cards with only Pre-grade active", () => {
  const pagePath = path.resolve("src/app/admin/lens/page.tsx");
  const moduleStub = {
    exports: {} as { default: () => React.ReactElement },
  };
  const mocks: Record<string, unknown> = {
    "next/link": {
      __esModule: true,
      default: linkMock,
    },
  };

  function localRequire(specifier: string) {
    return Object.prototype.hasOwnProperty.call(mocks, specifier) ? mocks[specifier] : requireFromTest(specifier);
  }

  vm.runInContext(
    transpile(pagePath),
    vm.createContext({
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      process,
      require: localRequire,
    }),
    { filename: pagePath }
  );

  const html = renderToStaticMarkup(React.createElement(moduleStub.exports.default));

  assert.match(html, /Owl Lens/);
  assert.match(html, /Pre-grade/);
  assert.match(html, /Inventory import/);
  assert.match(html, /Multi-card scan \(4-9 cards\)/);
  assert.match(html, /Front \+ back centering/);
  assert.match(html, /href="\/admin\/lens\/pregrade"/);
  assert.equal((html.match(/href="\/admin\/lens\/pregrade"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 3);
  assert.match(html, /Coming next/);
  assert.match(html, /Coming later/);
});

test("pregrade page renders standalone workspace and NULL inventory history", async () => {
  const pagePath = path.resolve("src/app/admin/lens/pregrade/page.tsx");
  const ranges: { from: number; to: number }[] = [];
  const nullFilters: { column: string; value: unknown }[] = [];
  const workspaceProps: Array<{ inventoryItemId?: string | null; cardIdentity: { name: string } }> = [];
  const rows = [
    {
      id: "measurement-1",
      inventory_item_id: null,
      created_at: "2026-05-16T03:00:00.000Z",
      left_pct: 52,
      right_pct: 48,
      top_pct: 49,
      bottom_pct: 51,
      worst_axis: "leftRight",
      worst_axis_max_pct: 52,
      psa_ceiling: "PSA_10",
    },
    {
      id: "measurement-2",
      inventory_item_id: null,
      created_at: "2026-05-15T03:00:00.000Z",
      left_pct: 58,
      right_pct: 42,
      top_pct: 55,
      bottom_pct: 45,
      worst_axis: "leftRight",
      worst_axis_max_pct: 58,
      psa_ceiling: "PSA_9",
    },
  ];
  const supabase = {
    from(table: string) {
      assert.equal(table, "centering_measurements");
      const query = {
        select(_columns: string, _options?: { count?: string }) {
          return query;
        },
        is(column: string, value: unknown) {
          nullFilters.push({ column, value });
          return query;
        },
        order() {
          return query;
        },
        async range(from: number, to: number) {
          ranges.push({ from, to });
          return {
            data: rows.slice(from, to + 1),
            error: null,
            count: 21,
          };
        },
      };
      return query;
    },
  };
  const moduleStub = {
    exports: {} as {
      default: (props: { searchParams?: { page?: string } }) => Promise<React.ReactElement>;
    },
  };
  const mocks: Record<string, unknown> = {
    "@/components/centering/CenteringWorkspace": {
      __esModule: true,
      default(props: { inventoryItemId?: string | null; cardIdentity: { name: string } }) {
        workspaceProps.push(props);
        return React.createElement(
          "div",
          {
            "data-testid": "centering-workspace",
            "data-inventory": props.inventoryItemId ?? "",
            "data-card": props.cardIdentity.name,
          },
          "Standalone workspace"
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
      default: linkMock,
    },
  };

  function localRequire(specifier: string) {
    return Object.prototype.hasOwnProperty.call(mocks, specifier) ? mocks[specifier] : requireFromTest(specifier);
  }

  vm.runInContext(
    transpile(pagePath),
    vm.createContext({
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      process,
      require: localRequire,
    }),
    { filename: pagePath }
  );

  const element = await moduleStub.exports.default({ searchParams: { page: "1" } });
  const html = renderToStaticMarkup(element);

  assert.deepEqual(nullFilters, [{ column: "inventory_item_id", value: null }]);
  assert.deepEqual(ranges, [{ from: 0, to: 19 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(workspaceProps)), [{ cardIdentity: { name: "Standalone pre-grade" } }]);
  assert.match(html, /data-testid="centering-workspace"/);
  assert.match(html, /Pre-grade History/);
  assert.match(html, /PSA_10/);
  assert.match(html, /52\.00% \/ 48\.00%/);
  assert.match(html, /49\.00% \/ 51\.00%/);
  assert.match(html, /Left\/right at 52\.00%/);
  assert.match(html, /Next pre-grades/);
  assert.match(html, /page=2/);
});
