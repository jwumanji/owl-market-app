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
    return resolveWithExtension(path.resolve("src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return resolveWithExtension(path.resolve(path.dirname(fromPath), specifier));
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

function linkMock(props: { href: string; children: React.ReactNode; className?: string; [key: string]: unknown }) {
  const { href, children, ...rest } = props;
  return React.createElement("a", { href, ...rest }, children);
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
      File,
      FormData,
      module: moduleStub,
      process,
      Response,
      require: localRequire,
    }),
    { filename: absolutePath }
  );

  cache.set(absolutePath, moduleStub.exports);
  return moduleStub.exports as T;
}

type LensFace = "front" | "back";

type Upload = {
  fileName: string;
  fileSize?: number | null;
  previewUrl: string | null;
};

type OverlayGeometry = {
  outer: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  };
  inner: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  };
};

type PregradeWorkspaceModule = {
  default: React.ComponentType;
  PregradeHeader: React.ComponentType<{ isResults: boolean }>;
  createInitialPregradeState: () => Record<string, unknown>;
  pregradeReducer: (state: Record<string, unknown>, action: Record<string, unknown>) => Record<string, unknown>;
  saveFace: (input: {
    face: LensFace;
    upload: Upload & {
      file: File;
      imageSize: { width: number; height: number };
      contentType: string;
    };
    faceState: {
      face: LensFace;
      overlay: OverlayGeometry;
      imageUrl: string | null;
      imageSize: { width: number; height: number };
    };
    faceMeta?: undefined;
    cardIdentity: string;
    cardSessionId: string;
    updateExisting?: boolean;
    fetchImpl: typeof fetch;
  }) => Promise<void>;
  PregradeUploadState: (props: {
    uploads: Partial<Record<LensFace, Upload>>;
    idleNotices: Partial<Record<LensFace, string>>;
    addBackMode: boolean;
    onFileSelect: (face: LensFace, file: File) => void;
    onClearFace: (face: LensFace) => void;
    onContinue: () => void;
    onMeasureBack: () => void;
  }) => React.ReactElement;
  IdentifyStep: (props: {
    cardIdentity: string;
    catalogMatch: { cardImageId: string; name: string; number: string } | null;
    onCardIdentityChange: (value: string) => void;
    onBack: () => void;
    onMeasure: () => void;
  }) => React.ReactElement;
};

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (React.isValidElement(node)) return textContent(node.props.children);
  return "";
}

function walkElements(node: React.ReactNode, elements: React.ReactElement[] = []) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    elements.push(child);
    walkElements(child.props.children, elements);
  });
  return elements;
}

function uploadProps(overrides: {
  uploads?: Partial<Record<LensFace, Upload>>;
  idleNotices?: Partial<Record<LensFace, string>>;
} = {}) {
  return {
    uploads: overrides.uploads ?? {},
    idleNotices: overrides.idleNotices ?? {},
    addBackMode: false,
    onFileSelect: () => undefined,
    onClearFace: () => undefined,
    onContinue: () => undefined,
    onMeasureBack: () => undefined,
  };
}

function renderUploadState(overrides: Parameters<typeof uploadProps>[0] = {}) {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const props = uploadProps(overrides);
  return {
    html: renderToStaticMarkup(React.createElement(workspace.PregradeUploadState, props)),
    tree: workspace.PregradeUploadState(props),
  };
}

function continueButton(root: React.ReactElement) {
  const button = walkElements(root).find(
    (element) => element.type === "button" && textContent(element.props.children).includes("Continue to identify")
  );
  assert.ok(button);
  return button;
}

function measureCenteringButton(root: React.ReactElement) {
  const button = walkElements(root).find(
    (element) => element.type === "button" && textContent(element.props.children).includes("Measure centering")
  );
  assert.ok(button);
  return button;
}

function uploadPane(root: React.ReactElement, face: LensFace) {
  const pane = walkElements(root).find((element) => element.props.face === face);
  assert.ok(pane);
  return pane;
}

const overlay: OverlayGeometry = {
  outer: {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    br: { x: 100, y: 140 },
    bl: { x: 0, y: 140 },
  },
  inner: {
    tl: { x: 24, y: 28 },
    tr: { x: 74, y: 28 },
    br: { x: 74, y: 108 },
    bl: { x: 24, y: 108 },
  },
};

test("PregradeWorkspace upload state renders preview and two upload boxes without a name field", () => {
  const { html } = renderUploadState();
  const uploadPaneCount = html.match(/data-upload-pane="/g)?.length ?? 0;
  const uploadColumnsIndex = html.indexOf('data-upload-columns="true"');

  assert.match(html, /data-pregrade-upload-state="true"/);
  assert.ok(uploadColumnsIndex >= 0);
  // Naming now lives on the Identify step, not Upload.
  assert.doesNotMatch(html, /data-card-name-row="true"/);
  assert.doesNotMatch(html, /CARD NAME/);
  assert.match(html, /data-card-preview-column="true"/);
  assert.equal(uploadPaneCount, 2);
  assert.match(html, /Card preview/);
  assert.match(html, /Front[\s\S]*required/);
  assert.match(html, /Back[\s\S]*optional/);
  assert.match(html, /Continue to identify/);
});

test("PregradeWorkspace identify step requires a name and disables the catalog seam", () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const baseProps = {
    catalogMatch: null,
    onCardIdentityChange: () => undefined,
    onBack: () => undefined,
    onMeasure: () => undefined,
  };
  const emptyTree = workspace.IdentifyStep({ ...baseProps, cardIdentity: "" });
  const namedTree = workspace.IdentifyStep({ ...baseProps, cardIdentity: "Nami" });
  const emptyHtml = renderToStaticMarkup(
    React.createElement(workspace.IdentifyStep, { ...baseProps, cardIdentity: "" })
  );

  // Required name field present; catalog search is a disabled seam (no card_image_id this pass).
  assert.match(emptyHtml, /data-pregrade-identify-state="true"/);
  assert.match(emptyHtml, /CARD NAME/);
  assert.match(emptyHtml, /data-catalog-seam="true"/);
  assert.match(emptyHtml, /disabled/);

  // Measure is gated on a non-empty name.
  assert.equal(measureCenteringButton(emptyTree).props.disabled, true);
  assert.equal(measureCenteringButton(namedTree).props.disabled, false);
});

test("PregradeWorkspace card preview starts empty and uses front upload thumbnail", () => {
  const empty = renderUploadState();
  const uploaded = renderUploadState({
    uploads: {
      front: {
        fileName: "front.jpg",
        fileSize: 1024,
        previewUrl: "blob:front",
      },
    },
  });

  assert.match(empty.html, /data-card-preview="empty"/);
  assert.match(uploaded.html, /data-card-preview="front"/);
  assert.match(uploaded.html, /src="blob:front"/);
  assert.match(uploaded.html, /alt="Front card thumbnail"/);
});

test("PregradeWorkspace continue button only requires front upload", () => {
  const empty = renderUploadState();
  const frontOnly = renderUploadState({
    uploads: {
      front: {
        fileName: "front.jpg",
        fileSize: 1024,
        previewUrl: "blob:front",
      },
    },
  });

  assert.equal(continueButton(empty.tree).props.disabled, true);
  assert.equal(continueButton(frontOnly.tree).props.disabled, false);
});

test("PregradeWorkspace upload failures stay isolated per face", () => {
  const frontFailed = renderUploadState({ idleNotices: { front: "Front upload failed" } });
  const backFailed = renderUploadState({ idleNotices: { back: "Back upload failed" } });

  assert.equal(textContent(uploadPane(frontFailed.tree, "front").props.notice), "Front upload failed");
  assert.equal(uploadPane(frontFailed.tree, "back").props.notice, null);
  assert.equal(uploadPane(backFailed.tree, "front").props.notice, null);
  assert.equal(textContent(uploadPane(backFailed.tree, "back").props.notice), "Back upload failed");
});

test("PregradeWorkspace header uses a back arrow icon link to Owl Lens", () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const html = renderToStaticMarkup(React.createElement(workspace.default));

  assert.match(html, /href="\/admin\/lens"/);
  assert.match(html, /aria-label="Back to Owl Lens"/);
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.doesNotMatch(html, /Back to Owl Lens<\/a>/);
});

test("PregradeWorkspace report header links back to Pre-grade with a visible label", () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const html = renderToStaticMarkup(React.createElement(workspace.PregradeHeader, { isResults: true }));

  assert.match(html, /href="\/admin\/lens\/pregrade"/);
  assert.match(html, /aria-label="Back to Pre-grade"/);
  assert.match(html, /Back to Pre-grade/);
  assert.match(html, /viewBox="0 0 24 24"/);
});

test("PregradeWorkspace re-measure reopens the saved session in adjust mode with the same session id", () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const state = {
    ...workspace.createInitialPregradeState(),
    step: "result",
    resultMode: "view",
    saved: true,
    activeResultFace: "back",
    cardSessionId: sessionId,
    faces: {
      front: {
        face: "front",
        overlay,
        imageUrl: "blob:front",
        imageSize: { width: 100, height: 140 },
      },
    },
  };

  const next = workspace.pregradeReducer(state, { type: "reopenSavedSession" });

  assert.equal(next.step, "result");
  assert.equal(next.resultMode, "adjust");
  assert.equal(next.remeasureMode, true);
  assert.equal(next.cardSessionId, sessionId);
  assert.equal(next.activeResultFace, "front");
});

test("PregradeWorkspace finishMeasure lands in view on a clean measurement and adjust on a noisy one", () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const front = { face: "front", overlay, imageUrl: "blob:front", imageSize: { width: 100, height: 140 }, adjusted: false };
  const base = { ...workspace.createInitialPregradeState(), step: "measure", faces: { front } };

  // Clean measurement (no notice, no placeholder) → report-first view.
  const clean = workspace.pregradeReducer(base, { type: "finishMeasure", activeFace: "front", notice: null });
  assert.equal(clean.step, "result");
  assert.equal(clean.resultMode, "view");

  // A CV notice forces adjust.
  const noisyNotice = workspace.pregradeReducer(base, {
    type: "finishMeasure",
    activeFace: "front",
    notice: { kind: "manual", body: "Frame the borders yourself" },
  });
  assert.equal(noisyNotice.resultMode, "adjust");

  // A placeholder overlay (face.adjusted) forces adjust even without a notice.
  const placeholderBase = { ...base, faces: { front: { ...front, adjusted: true } } };
  const placeholder = workspace.pregradeReducer(placeholderBase, {
    type: "finishMeasure",
    activeFace: "front",
    notice: null,
  });
  assert.equal(placeholder.resultMode, "adjust");
});

test("PregradeWorkspace re-measure save targets the existing session id", async () => {
  const workspace = loadModule<PregradeWorkspaceModule>("src/components/lens/PregradeWorkspace.tsx");
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ measurement: {}, updatedExisting: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await workspace.saveFace({
    face: "front",
    upload: {
      file: new File(["image"], "front.jpg", { type: "image/jpeg" }),
      fileName: "front.jpg",
      fileSize: 5,
      contentType: "image/jpeg",
      previewUrl: "blob:front",
      imageSize: { width: 100, height: 140 },
    },
    faceState: {
      face: "front",
      overlay,
      imageUrl: "blob:front",
      imageSize: { width: 100, height: 140 },
    },
    faceMeta: undefined,
    cardIdentity: "Nami",
    cardSessionId: sessionId,
    updateExisting: true,
    fetchImpl,
  });

  const body = calls[0].init?.body as FormData;
  assert.equal(calls[0].url, "/api/centering/save");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(body.get("cardSessionId"), sessionId);
  assert.equal(body.get("updateExisting"), "true");
});
