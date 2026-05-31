import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);

function loadModule<T>(filePath: string): T {
  const absolutePath = path.resolve(filePath);
  const javaScript = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const moduleStub = { exports: {} as Record<string, unknown> };
  vm.runInContext(
    javaScript,
    // `fetch` is the module's default fetchImpl — provide the Node global so the default resolves.
    vm.createContext({ exports: moduleStub.exports, module: moduleStub, require: requireFromTest, fetch }),
    { filename: absolutePath }
  );
  return moduleStub.exports as T;
}

type ReportCardNameModule = {
  reportCardNameDisplay: (value?: string | null) => string;
  reportCardNameKeyAction: (key: string) => "commit" | "cancel" | null;
  saveReportCardIdentity: (input: {
    sessionId?: string | null;
    cardIdentity: string;
    fetchImpl?: typeof fetch;
  }) => Promise<unknown>;
};

function load() {
  return loadModule<ReportCardNameModule>("src/components/lens/report-card-name.ts");
}

test("reportCardNameDisplay trims and falls back to Untitled card", () => {
  const mod = load();
  assert.equal(mod.reportCardNameDisplay("  Nami  "), "Nami");
  assert.equal(mod.reportCardNameDisplay("   "), "Untitled card");
  assert.equal(mod.reportCardNameDisplay(null), "Untitled card");
  assert.equal(mod.reportCardNameDisplay(undefined), "Untitled card");
});

test("reportCardNameKeyAction commits Enter and cancels Escape", () => {
  const mod = load();
  assert.equal(mod.reportCardNameKeyAction("Enter"), "commit");
  assert.equal(mod.reportCardNameKeyAction("Escape"), "cancel");
  assert.equal(mod.reportCardNameKeyAction("Tab"), null);
});

test("saveReportCardIdentity PATCHes the session and normalizes empty names to null", async () => {
  const mod = load();
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ session: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await mod.saveReportCardIdentity({ sessionId: "session-id", cardIdentity: "  Nami  ", fetchImpl });
  await mod.saveReportCardIdentity({ sessionId: "session-id", cardIdentity: "", fetchImpl });

  assert.equal(calls[0].url, "/api/centering/session/session-id");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { card_identity: "Nami" });
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { card_identity: null });
});

test("saveReportCardIdentity requires a saved session id", async () => {
  const mod = load();
  await assert.rejects(
    () => mod.saveReportCardIdentity({ sessionId: null, cardIdentity: "Nami" }),
    /saved pre-grade session id is required/
  );
});
