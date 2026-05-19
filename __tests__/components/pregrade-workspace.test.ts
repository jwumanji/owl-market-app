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

type PregradeWorkspaceModule = {
  PregradeUploadState: (props: {
    cardIdentity: string;
    uploads: Partial<Record<LensFace, Upload>>;
    idleNotices: Partial<Record<LensFace, string>>;
    addBackMode: boolean;
    onCardIdentityChange: (value: string) => void;
    onFileSelect: (face: LensFace, file: File) => void;
    onClearFace: (face: LensFace) => void;
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
    cardIdentity: "OP01-001",
    uploads: overrides.uploads ?? {},
    idleNotices: overrides.idleNotices ?? {},
    addBackMode: false,
    onCardIdentityChange: () => undefined,
    onFileSelect: () => undefined,
    onClearFace: () => undefined,
    onMeasure: () => undefined,
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

function measureButton(root: React.ReactElement) {
  const button = walkElements(root).find(
    (element) => element.type === "button" && textContent(element.props.children).trim() === "Measure"
  );
  assert.ok(button);
  return button;
}

function uploadPane(root: React.ReactElement, face: LensFace) {
  const pane = walkElements(root).find((element) => element.props.face === face);
  assert.ok(pane);
  return pane;
}

test("PregradeWorkspace upload state renders card name row above preview and upload boxes", () => {
  const { html } = renderUploadState();
  const uploadPaneCount = html.match(/data-upload-pane="/g)?.length ?? 0;
  const cardNameRowIndex = html.indexOf('data-card-name-row="true"');
  const uploadColumnsIndex = html.indexOf('data-upload-columns="true"');
  const uploadColumnsHtml = html.slice(uploadColumnsIndex);

  assert.match(html, /data-pregrade-upload-state="true"/);
  assert.ok(cardNameRowIndex >= 0);
  assert.ok(uploadColumnsIndex >= 0);
  assert.ok(cardNameRowIndex < uploadColumnsIndex);
  assert.doesNotMatch(uploadColumnsHtml, /Add card name/);
  assert.match(uploadColumnsHtml, /data-card-preview-column="true"/);
  assert.equal(uploadPaneCount, 2);
  assert.match(html, /CARD NAME/);
  assert.match(html, /Card preview/);
  assert.match(html, /Front[\s\S]*required/);
  assert.match(html, /Back[\s\S]*optional/);
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

test("PregradeWorkspace measure button only requires front upload", () => {
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

  assert.equal(measureButton(empty.tree).props.disabled, true);
  assert.equal(measureButton(frontOnly.tree).props.disabled, false);
});

test("PregradeWorkspace upload failures stay isolated per face", () => {
  const frontFailed = renderUploadState({ idleNotices: { front: "Front upload failed" } });
  const backFailed = renderUploadState({ idleNotices: { back: "Back upload failed" } });

  assert.equal(textContent(uploadPane(frontFailed.tree, "front").props.notice), "Front upload failed");
  assert.equal(uploadPane(frontFailed.tree, "back").props.notice, null);
  assert.equal(uploadPane(backFailed.tree, "front").props.notice, null);
  assert.equal(textContent(uploadPane(backFailed.tree, "back").props.notice), "Back upload failed");
});
