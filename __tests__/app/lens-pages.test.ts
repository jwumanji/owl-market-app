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

test("pregrade page renders the standalone pregrade workspace", () => {
  const pagePath = path.resolve("src/app/admin/lens/pregrade/page.tsx");
  const moduleStub = {
    exports: {} as {
      default: () => React.ReactElement;
    },
  };
  const mocks: Record<string, unknown> = {
    "@/components/lens/PregradeWorkspace": {
      __esModule: true,
      default() {
        return React.createElement("div", { "data-testid": "pregrade-workspace" }, "Pregrade workspace");
      },
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

  const element = moduleStub.exports.default();
  const html = renderToStaticMarkup(element);

  assert.match(html, /data-testid="pregrade-workspace"/);
  assert.doesNotMatch(html, /Pre-grade History/);
});
