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
const componentPath = path.resolve("src/components/centering/CenteringWorkspace.tsx");
const componentSource = fs.readFileSync(componentPath, "utf8");
const componentJavaScript = ts.transpileModule(componentSource, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type Exports = {
  default: React.ComponentType<{
    gameSlug?: string | null;
    inventoryItemId?: string | null;
    preloadImageUrl?: string | null;
    cardIdentity: { name: string; setCode?: string | null; cardNumber?: string | null; rarity?: string | null };
  }>;
  buildMeasurementFormData: (input: {
    gameSlug?: string | null;
    inventoryItemId?: string | null;
    file: File;
    manualOverlay?: unknown;
  }) => FormData;
  buildResultViewModel: (result: Record<string, unknown>) => Record<string, unknown>;
  buildWorkspaceContextCopy: (input: { inventoryItemId?: string | null }) => Record<string, unknown>;
  centeringReducer: (state: Record<string, unknown>, action: Record<string, unknown>) => Record<string, unknown>;
  defaultManualOverlay: (width: number, height: number) => Record<string, unknown>;
  downloadReportElement: (input: { element: HTMLElement; filename: string; toPngImpl: () => Promise<string> }) => Promise<void>;
  failureViewModel: (error: { code?: string; message?: string } | null | undefined) => Record<string, unknown>;
  fetchPreloadedImageFile: (input: { imageUrl: string; fetchImpl: typeof fetch }) => Promise<File>;
  isManualCorrectionError: (error: { code?: string } | null) => boolean;
  measurePreloadedImage: (input: {
    imageUrl: string;
    gameSlug?: string | null;
    inventoryItemId?: string | null;
    dispatchAction: (action: { type: string; result?: unknown; error?: unknown }) => void;
    onFile: (file: File) => void;
    fetchImpl: typeof fetch;
    wait: () => Promise<void>;
  }) => Promise<{ ok: boolean; file?: File; preloadError?: string }>;
  moveManualCorner: (input: Record<string, unknown>) => Record<string, unknown>;
  PRELOAD_FETCH_ERROR_MESSAGE: string;
  psaTone: (ceiling: string) => string;
  reportFileName: (cardName: string) => string;
};

function loadComponent() {
  const clickedLinks: Record<string, string>[] = [];
  const mocks: Record<string, unknown> = {
    "html-to-image": {
      toPng() {
        return Promise.resolve("data:image/png;base64,real");
      },
    },
    "react-dropzone": {
      useDropzone() {
        return {
          getInputProps() {
            return {};
          },
          getRootProps() {
            return {};
          },
          isDragActive: false,
        };
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
    exports: {} as Exports,
  };
  const context = vm.createContext({
    console,
    document: {
      createElement(tagName: string) {
        assert.equal(tagName, "a");
        const link = {
          href: "",
          download: "",
          click() {
            clickedLinks.push({ href: link.href, download: link.download });
          },
        };
        return link;
      },
    },
    exports: moduleStub.exports,
    File,
    FormData,
    Image: class {},
    module: moduleStub,
    process,
    require: localRequire,
    URL,
    window: {
      addEventListener() {
        return undefined;
      },
      removeEventListener() {
        return undefined;
      },
      setTimeout,
    },
  });

  vm.runInContext(componentJavaScript, context, { filename: componentPath });

  return {
    exports: moduleStub.exports,
    clickedLinks,
  };
}

function measurementResponse() {
  return {
    image: {
      contentType: "image/jpeg",
      widthPx: 1024,
      heightPx: 1428,
    },
    centering: {
      leftRight: {
        leftPercent: 52,
        rightPercent: 48,
      },
      topBottom: {
        topPercent: 49,
        bottomPercent: 51,
      },
      worstAxis: "leftRight",
      worstAxisMaxPercent: 52,
    },
    psa: {
      ceiling: "PSA_10",
      label: "PSA 10 centering ceiling",
      thresholds: [
        { ceiling: "PSA_10", label: "PSA 10", maxMajorPercent: 55, ratioLabel: "55/45" },
        { ceiling: "PSA_9", label: "PSA 9", maxMajorPercent: 60, ratioLabel: "60/40" },
      ],
    },
    overlay: {
      coordinateSpace: "imagePixels",
      outerCard: { x: 32, y: 28, width: 960, height: 1372 },
      innerFrame: { x: 118, y: 134, width: 792, height: 1164 },
      gaps: { leftPx: 86, rightPx: 82, topPx: 106, bottomPx: 102 },
    },
    pipeline: {
      mode: "mock",
      version: "0.1.0",
    },
    metadata: {
      processingMs: 42,
      warnings: [],
    },
  };
}

function renderWorkspace({
  gameSlug = "one-piece",
  preloadImageUrl = null,
  inventoryItemId = "inventory-1",
}: {
  gameSlug?: string | null;
  preloadImageUrl?: string | null;
  inventoryItemId?: string | null;
} = {}) {
  const { exports } = loadComponent();

  return renderToStaticMarkup(
    React.createElement(exports.default, {
      gameSlug,
      inventoryItemId,
      preloadImageUrl,
      cardIdentity: {
        name: "Nami",
        setCode: "OP01",
        cardNumber: "OP01-016",
        rarity: "R",
      },
    })
  );
}

function responseLike({
  ok,
  status = ok ? 200 : 500,
  contentType = "application/json",
  body,
  blob,
}: {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: unknown;
  blob?: Blob;
}) {
  return {
    ok,
    status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async blob() {
      return blob ?? new Blob(["image"], { type: contentType });
    },
    async json() {
      return body ?? null;
    },
  } as Response;
}

test("workspace renders measure-this-card button when preload URL is passed", () => {
  const html = renderWorkspace({ preloadImageUrl: "https://cdn.example/cards/front.png" });

  assert.match(html, /Inventory centering/);
  assert.match(html, /Saves to inventory/);
  assert.match(html, /Results attach to this inventory item/);
  assert.match(html, /Measure the saved front image and save the centering result to this inventory item/);
  assert.match(html, /Ready to measure/);
  assert.match(html, /Measure this card/);
  assert.match(html, /Upload a different image/);
  assert.doesNotMatch(html, /Upload a front scan/);
});

test("workspace renders upload zone when no preload URL is passed", () => {
  const html = renderWorkspace();

  assert.match(html, /Upload front scan for this inventory item/);
  assert.match(html, /Browse scan/);
  assert.match(html, /Saves to inventory/);
  assert.doesNotMatch(html, /Measure this card/);
});

test("workspace renders standalone mode without inventory item context", () => {
  const html = renderWorkspace({ inventoryItemId: null, preloadImageUrl: "https://cdn.example/cards/front.png" });

  assert.match(html, /Standalone pre-grade/);
  assert.match(html, /No inventory link/);
  assert.match(html, /will not attach to inventory/);
  assert.match(html, /Upload a standalone front scan/);
  assert.match(html, /Browse scan/);
  assert.doesNotMatch(html, /Ready to measure/);
  assert.doesNotMatch(html, /Measure this card/);
});

test("workspace context copy differentiates inventory and standalone destinations", () => {
  const { exports } = loadComponent();

  const inventoryCopy = exports.buildWorkspaceContextCopy({ inventoryItemId: "inventory-1" });
  const standaloneCopy = exports.buildWorkspaceContextCopy({ inventoryItemId: null });

  assert.equal(inventoryCopy.mode, "inventory");
  assert.equal(inventoryCopy.badge, "Saves to inventory");
  assert.equal(inventoryCopy.processingTarget, "Result target: inventory item");
  assert.equal(standaloneCopy.mode, "standalone");
  assert.equal(standaloneCopy.badge, "No inventory link");
  assert.equal(standaloneCopy.processingTarget, "Result target: standalone pre-grade");
});

test("workspace reducer moves through upload, processing, results, failure, and reset states", () => {
  const { exports } = loadComponent();
  const initial = { status: "idle", result: null, error: null };
  const uploading = exports.centeringReducer(initial, { type: "startUpload" });
  const processing = exports.centeringReducer(uploading, { type: "startProcessing" });
  const results = exports.centeringReducer(processing, { type: "success", result: measurementResponse() });
  const failure = exports.centeringReducer(processing, {
    type: "failure",
    error: { code: "CARD_NOT_DETECTED", message: "No card boundary could be detected." },
  });
  const reset = exports.centeringReducer(failure, { type: "reset" });

  assert.equal(uploading.status, "uploading");
  assert.equal(processing.status, "processing");
  assert.equal(results.status, "results");
  assert.equal(failure.status, "failure");
  assert.equal(reset.status, "idle");
});

test("result view model renders echoed thresholds and PSA tone", () => {
  const { exports } = loadComponent();

  const viewModel = exports.buildResultViewModel(measurementResponse());

  assert.equal(viewModel.tone, "green");
  assert.equal(viewModel.ceilingLabel, "PSA 10 centering ceiling");
  assert.equal(viewModel.leftRight, "52.00 / 48.00");
  assert.equal(viewModel.topBottom, "49.00 / 51.00");
  assert.deepEqual(JSON.parse(JSON.stringify(viewModel.thresholds)), [
    { ceiling: "PSA_10", label: "PSA 10", ratioLabel: "55/45", maxMajorPercent: 55 },
    { ceiling: "PSA_9", label: "PSA 9", ratioLabel: "60/40", maxMajorPercent: 60 },
  ]);
});

test("failure view model distinguishes manual, validation, and service errors", () => {
  const { exports } = loadComponent();

  const manual = exports.failureViewModel({ code: "CARD_NOT_DETECTED", message: "No card boundary could be detected." });
  const validation = exports.failureViewModel({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Upload a JPEG, PNG, or WEBP image." });
  const service = exports.failureViewModel({ code: "MEASUREMENT_FAILED", message: "Could not reach the centering service." });

  assert.equal(manual.kind, "manual");
  assert.equal(manual.eyebrow, "Manual correction available");
  assert.equal(validation.kind, "validation");
  assert.equal(validation.eyebrow, "Upload needs attention");
  assert.equal(service.kind, "service");
  assert.equal(service.eyebrow, "Service unavailable");
});

test("manual-drag handler updates corrected overlay geometry and gap measurements", () => {
  const { exports } = loadComponent();
  const overlay = exports.defaultManualOverlay(1000, 1400);

  const moved = exports.moveManualCorner({
    overlay,
    target: "innerFrame",
    corner: "topLeft",
    x: 180,
    y: 220,
    bounds: { width: 1000, height: 1400 },
  }) as { innerFrame: { x: number; y: number }; gaps: { leftPx: number; topPx: number } };

  assert.equal(moved.innerFrame.x, 180);
  assert.equal(moved.innerFrame.y, 220);
  assert.equal(moved.gaps.leftPx, 120);
  assert.equal(moved.gaps.topPx, 164);
});

test("manual correction retry payload includes manual_adjustment and corrected coordinates", () => {
  const { exports } = loadComponent();
  const overlay = exports.defaultManualOverlay(1000, 1400);
  const file = new File(["image"], "card.jpg", { type: "image/jpeg" });

  const formData = exports.buildMeasurementFormData({
    inventoryItemId: "inventory-1",
    file,
    manualOverlay: overlay,
  });

  assert.equal(formData.get("inventoryItemId"), "inventory-1");
  assert.equal(formData.has("game"), false);
  assert.equal(formData.get("file"), file);
  assert.equal(formData.get("manual_adjustment"), "true");
  assert.deepEqual(JSON.parse(String(formData.get("corrected_overlay"))), JSON.parse(JSON.stringify(overlay)));
  assert.equal(exports.isManualCorrectionError({ code: "CARD_NOT_DETECTED" }), true);
  assert.equal(exports.isManualCorrectionError({ code: "FILE_TOO_LARGE" }), false);
});

test("standalone measurement payload omits inventoryItemId while preserving game scope", () => {
  const { exports } = loadComponent();
  const file = new File(["image"], "card.jpg", { type: "image/jpeg" });

  const formData = exports.buildMeasurementFormData({
    gameSlug: "one-piece",
    file,
  });

  assert.equal(formData.has("inventoryItemId"), false);
  assert.equal(formData.get("game"), "one-piece");
  assert.equal(formData.get("file"), file);
});

test("measure-this-card action fetches the preloaded image and posts it for measurement", async () => {
  const { exports } = loadComponent();
  const actions: string[] = [];
  const files: File[] = [];
  const postBodies: FormData[] = [];
  const fetchCalls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push(url);

    if (url === "https://cdn.example/cards/front.png") {
      return responseLike({
        ok: true,
        contentType: "image/png",
        blob: new Blob(["saved scan"], { type: "image/png" }),
      });
    }

    if (url === "/api/centering/measure") {
      postBodies.push(init?.body as FormData);
      return responseLike({ ok: true, body: measurementResponse() });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const outcome = await exports.measurePreloadedImage({
    imageUrl: "https://cdn.example/cards/front.png",
    gameSlug: "one-piece",
    inventoryItemId: "inventory-1",
    dispatchAction(action) {
      actions.push(action.type);
    },
    onFile(file) {
      files.push(file);
    },
    fetchImpl,
    wait: async () => undefined,
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(actions, ["startUpload", "startProcessing", "success"]);
  assert.deepEqual(fetchCalls, ["https://cdn.example/cards/front.png", "/api/centering/measure"]);
  assert.equal(files[0].name, "front.png");
  assert.equal(files[0].type, "image/png");
  assert.equal(postBodies[0].get("inventoryItemId"), "inventory-1");
  assert.equal(postBodies[0].get("game"), "one-piece");
  assert.equal(postBodies[0].get("file"), files[0]);
});

test("preloaded image fetch failure returns inline error path and leaves upload zone available", async () => {
  const { exports } = loadComponent();
  const actions: string[] = [];
  const fetchImpl = async () => responseLike({ ok: false, status: 404, contentType: "text/plain" });

  const outcome = await exports.measurePreloadedImage({
    imageUrl: "https://cdn.example/cards/missing.png",
    inventoryItemId: "inventory-1",
    dispatchAction(action) {
      actions.push(action.type);
    },
    onFile() {
      throw new Error("onFile should not be called when preload fetch fails");
    },
    fetchImpl,
    wait: async () => undefined,
  });
  const uploadZoneHtml = renderWorkspace();

  assert.equal(outcome.ok, false);
  assert.equal(outcome.preloadError, exports.PRELOAD_FETCH_ERROR_MESSAGE);
  assert.equal(exports.PRELOAD_FETCH_ERROR_MESSAGE, "Couldn't load saved scan. Upload a fresh image instead.");
  assert.deepEqual(actions, ["startUpload", "reset"]);
  assert.match(uploadZoneHtml, /Upload front scan for this inventory item/);
});

test("download report trigger writes a PNG filename and clicks a download link", async () => {
  const { exports, clickedLinks } = loadComponent();

  await exports.downloadReportElement({
    element: {} as HTMLElement,
    filename: exports.reportFileName("Monkey.D.Luffy OP01-001"),
    toPngImpl: async () => "data:image/png;base64,test",
  });

  assert.deepEqual(clickedLinks, [
    {
      href: "data:image/png;base64,test",
      download: "monkey-d-luffy-op01-001-report.png",
    },
  ]);
});
