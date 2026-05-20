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

function resolveSourceModule(specifier: string, fromPath: string) {
  if (specifier.startsWith("@/")) {
    const base = path.resolve("src", specifier.slice(2));
    return resolveWithExtension(base);
  }
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(fromPath), specifier);
    return resolveWithExtension(base);
  }
  return null;
}

function resolveWithExtension(base: string) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

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

function loadModule<T>(filePath: string, cache = new Map<string, unknown>()): T {
  const absolutePath = path.resolve(filePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath) as T;

  const moduleStub = { exports: {} as Record<string, unknown> };
  cache.set(absolutePath, moduleStub.exports);

  function localRequire(specifier: string) {
    if (specifier === "next/link") {
      return { __esModule: true, default: linkMock };
    }
    const sourcePath = resolveSourceModule(specifier, absolutePath);
    if (sourcePath) return loadModule(sourcePath, cache);
    return requireFromTest(specifier);
  }

  vm.runInContext(
    transpile(absolutePath),
    vm.createContext({
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      process,
      require: localRequire,
      URLSearchParams,
    }),
    { filename: absolutePath }
  );

  cache.set(absolutePath, moduleStub.exports);
  return moduleStub.exports as T;
}

type HistoryModule = {
  buildHistoryUrl: (input: { search: string; ceiling: null | 55 | 60 | 999 }) => string;
  createDebouncedSearchDispatcher: (input: {
    onSearchChange: (value: string) => void;
    delayMs?: number;
    schedule?: (callback: () => void, delayMs: number) => number;
    cancel?: (handle: number) => void;
  }) => ((value: string) => void) & { cancel: () => void };
  deletePreGradeSession: (input: { id: string; fetchImpl: typeof fetch }) => Promise<unknown>;
  filterPreGradeHistoryRows: (rows: PreGradeSession[], filter: null | 55 | 60 | 999) => PreGradeSession[];
  renamePreGradeSession: (input: { id: string; newName: string; fetchImpl: typeof fetch }) => Promise<unknown>;
};

type HistoryRowModule = {
  default: React.ComponentType<{
    session: PreGradeSession;
    variant: "full" | "compact";
    onRename?: (id: string, newName: string) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
  }>;
  confirmAndDeleteHistoryRow: (input: {
    id: string;
    onDelete?: (id: string) => Promise<void>;
    confirmDelete: (message: string) => boolean;
  }) => Promise<boolean>;
  saveHistoryRowRename: (input: {
    id: string;
    initialName: string | null;
    draftName: string;
    onRename?: (id: string, newName: string) => Promise<void>;
  }) => Promise<string>;
};

type HistoryFiltersModule = {
  default: React.ComponentType<{
    search: string;
    ceiling: null | 55 | 60 | 999;
    onSearchChange: (value: string) => void;
    onCeilingChange: (value: null | 55 | 60 | 999) => void;
  }>;
};

type PreGradeHistoryClientModule = {
  HistoryEmptyState: React.ComponentType<{
    hasFilters: boolean;
    onClearFilters: () => void;
  }>;
  HistoryLoadingSkeleton: React.ComponentType;
};

type PreGradeFace = {
  id: string;
  face: "front" | "back";
  createdAt: string | null;
  imagePath: string | null;
  signedImageUrl: string | null;
  overlayGeometry: unknown;
  leftPct: number | null;
  rightPct: number | null;
  topPct: number | null;
  bottomPct: number | null;
  worstAxis: "leftRight" | "topBottom";
  worstAxisMaxPct: number | null;
  psaCeiling:
    | "PSA_10"
    | "PSA_9"
    | "PSA_8"
    | "PSA_7"
    | "PSA_6"
    | "PSA_5"
    | "PSA_4"
    | "PSA_3_OR_LESS"
    | "PSA_2_OR_LESS"
    | "BELOW_PSA_7";
  manualAdjustment: boolean;
};

type PreGradeSession = {
  id: string;
  cardSessionId: string | null;
  cardIdentity: string | null;
  createdAt: string | null;
  ceiling: PreGradeFace["psaCeiling"];
  manualAdjustment: boolean;
  front: PreGradeFace | null;
  back: PreGradeFace | null;
};

function face(overrides: Partial<PreGradeFace> = {}): PreGradeFace {
  return {
    id: overrides.face === "back" ? "back-face" : "front-face",
    face: overrides.face ?? "front",
    createdAt: "2026-05-19T05:00:00.000Z",
    imagePath: "centering/user/session/front.jpg",
    signedImageUrl: "https://example.test/front.jpg",
    overlayGeometry: {},
    leftPct: 53,
    rightPct: 47,
    topPct: 51,
    bottomPct: 49,
    worstAxis: "leftRight",
    worstAxisMaxPct: 53,
    psaCeiling: "PSA_10",
    manualAdjustment: false,
    ...overrides,
  };
}

function session(overrides: Partial<PreGradeSession> = {}): PreGradeSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    cardSessionId: "11111111-1111-4111-8111-111111111111",
    cardIdentity: "Monkey D. Luffy OP01-001",
    createdAt: "2026-05-19T05:00:00.000Z",
    ceiling: "PSA_10",
    manualAdjustment: false,
    front: face(),
    back: null,
    ...overrides,
  };
}

test("HistoryRow full variant renders both face ratios and delete action", () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const html = renderToStaticMarkup(
    React.createElement(historyRow.default, {
      session: session({
        back: face({ face: "back", signedImageUrl: "https://example.test/back.jpg", leftPct: 58, rightPct: 42 }),
        manualAdjustment: true,
      }),
      variant: "full",
      onRename: async () => {},
      onDelete: async () => {},
    })
  );

  assert.match(html, /data-history-row-variant="full"/);
  assert.match(html, /Monkey D. Luffy OP01-001/);
  assert.match(html, /F:/);
  assert.match(html, /B:/);
  assert.match(html, /Adjusted manually/);
  assert.match(html, /Delete/);
});

test("HistoryRow compact variant omits delete and uses compact marker", () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const html = renderToStaticMarkup(
    React.createElement(historyRow.default, {
      session: session(),
      variant: "compact",
      onRename: async () => {},
    })
  );

  assert.match(html, /data-history-row-variant="compact"/);
  assert.doesNotMatch(html, /Delete/);
});

test("HistoryRow renders enlarged ceiling and thumbnail sizing for both variants", () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const compact = renderToStaticMarkup(
    React.createElement(historyRow.default, {
      session: session(),
      variant: "compact",
      onRename: async () => {},
    })
  );
  const full = renderToStaticMarkup(
    React.createElement(historyRow.default, {
      session: session(),
      variant: "full",
      onRename: async () => {},
    })
  );

  assert.match(compact, /data-history-ceiling="true"/);
  assert.match(compact, /h-\[52px\] w-\[52px\] text-\[26px\]/);
  assert.match(compact, /data-history-thumbnail="true"/);
  assert.match(compact, /aspect-\[2\.5\/3\.5\][^"]*w-16/);
  assert.match(full, /h-14 w-14 text-\[28px\]/);
  assert.match(full, /aspect-\[2\.5\/3\.5\][^"]*w-\[72px\]/);
});

test("HistoryRow ceiling pill uses grade tier color while ratios keep axis tone", () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const html = renderToStaticMarkup(
    React.createElement(historyRow.default, {
      session: session({
        ceiling: "PSA_5",
        front: face({ leftPct: 58, rightPct: 42, worstAxisMaxPct: 58 }),
        back: face({ face: "back", worstAxisMaxPct: 64, psaCeiling: "PSA_8" }),
      }),
      variant: "full",
      onRename: async () => {},
    })
  );

  assert.match(html, /color:var\(--coral\)/);
  assert.match(html, /border-color:var\(--coral\)/);
  assert.match(html, /data-history-ratios="true"/);
  assert.match(html, /text-\[14px\] leading-6/);
  assert.match(html, /text-owl/);
});

test("HistoryRow rename helper trims and calls callback", async () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const calls: Array<[string, string]> = [];

  const saved = await historyRow.saveHistoryRowRename({
    id: "session-id",
    initialName: "Old",
    draftName: "  New Name  ",
    onRename: async (id, newName) => {
      calls.push([id, newName]);
    },
  });

  assert.equal(saved, "New Name");
  assert.deepEqual(calls, [["session-id", "New Name"]]);
});

test("HistoryRow delete helper confirms before calling callback", async () => {
  const historyRow = loadModule<HistoryRowModule>("src/components/lens/HistoryRow.tsx");
  const calls: string[] = [];

  const canceled = await historyRow.confirmAndDeleteHistoryRow({
    id: "session-id",
    confirmDelete: () => false,
    onDelete: async (id) => {
      calls.push(id);
    },
  });
  const confirmed = await historyRow.confirmAndDeleteHistoryRow({
    id: "session-id",
    confirmDelete: () => true,
    onDelete: async (id) => {
      calls.push(id);
    },
  });

  assert.equal(canceled, false);
  assert.equal(confirmed, true);
  assert.deepEqual(calls, ["session-id"]);
});

test("HistoryFilters renders controlled ceiling chips", () => {
  const filters = loadModule<HistoryFiltersModule>("src/components/lens/HistoryFilters.tsx");
  const html = renderToStaticMarkup(
    React.createElement(filters.default, {
      search: "luffy",
      ceiling: 60,
      onSearchChange: () => {},
      onCeilingChange: () => {},
    })
  );

  assert.match(html, /Search by card name/);
  assert.match(html, /&lt;=60/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /border-owl\/50 bg-owl\/10 text-owl/);
});

test("PreGradeHistoryPage loading skeleton renders while fetching", () => {
  const client = loadModule<PreGradeHistoryClientModule>("src/components/lens/PreGradeHistoryClient.tsx");
  const html = renderToStaticMarkup(React.createElement(client.HistoryLoadingSkeleton));

  assert.match(html, /Loading pre-grade history/);
  assert.match(html, /animate-pulse/);
});

test("PreGradeHistoryPage empty state switches copy for filtered results", () => {
  const client = loadModule<PreGradeHistoryClientModule>("src/components/lens/PreGradeHistoryClient.tsx");
  const html = renderToStaticMarkup(
    React.createElement(client.HistoryEmptyState, {
      hasFilters: true,
      onClearFilters: () => {},
    })
  );

  assert.match(html, /No pre-grades match these filters/);
  assert.match(html, /Clear filters/);
});

test("history debounce dispatcher cancels stale search values", () => {
  const history = loadModule<HistoryModule>("src/components/lens/history-utils.ts");
  const fired: string[] = [];
  const scheduled: Array<{ id: number; callback: () => void; canceled: boolean }> = [];
  let nextId = 1;

  const dispatch = history.createDebouncedSearchDispatcher({
    onSearchChange: (value) => fired.push(value),
    delayMs: 300,
    schedule: (callback) => {
      const id = nextId++;
      scheduled.push({ id, callback, canceled: false });
      return id;
    },
    cancel: (handle) => {
      const target = scheduled.find((item) => item.id === handle);
      if (target) target.canceled = true;
    },
  });

  dispatch("lu");
  dispatch("luffy");
  scheduled.filter((item) => !item.canceled).forEach((item) => item.callback());

  assert.deepEqual(fired, ["luffy"]);
});

test("history URL combines debounced search and threshold ceiling filter", () => {
  const history = loadModule<HistoryModule>("src/components/lens/history-utils.ts");

  assert.equal(
    history.buildHistoryUrl({ search: "  shanks  ", ceiling: 999 }),
    "/api/centering/history?search=shanks&ceiling=999"
  );
});

test("history threshold filtering applies ceiling AND after API search", () => {
  const history = loadModule<HistoryModule>("src/components/lens/history-utils.ts");
  const rows = [
    session({ id: "gain", front: face({ worstAxisMaxPct: 54 }) }),
    session({ id: "owl", front: face({ worstAxisMaxPct: 58, psaCeiling: "PSA_9" }), ceiling: "PSA_9" }),
    session({ id: "loss", front: face({ worstAxisMaxPct: 66, psaCeiling: "PSA_7" }), ceiling: "PSA_7" }),
  ];

  assert.deepEqual(history.filterPreGradeHistoryRows(rows, 55).map((row) => row.id), ["gain"]);
  assert.deepEqual(history.filterPreGradeHistoryRows(rows, 60).map((row) => row.id), ["gain", "owl"]);
  assert.deepEqual(history.filterPreGradeHistoryRows(rows, 999).map((row) => row.id), ["loss"]);
});

test("history API helpers call PATCH and DELETE session routes", async () => {
  const history = loadModule<HistoryModule>("src/components/lens/history-utils.ts");
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ session: session() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await history.renamePreGradeSession({ id: "session-id", newName: "  Nami  ", fetchImpl });
  await history.deletePreGradeSession({ id: "session-id", fetchImpl });

  assert.equal(calls[0].url, "/api/centering/session/session-id");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { cardIdentity: "Nami" });
  assert.equal(calls[1].url, "/api/centering/session/session-id");
  assert.equal(calls[1].init?.method, "DELETE");
});
