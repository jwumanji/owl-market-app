import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
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

function loadModule<T>(
  filePath: string,
  inputClick: () => void,
  cache = new Map<string, unknown>()
): T {
  const absolutePath = path.resolve(filePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath) as T;

  const moduleStub = { exports: {} as Record<string, unknown> };
  cache.set(absolutePath, moduleStub.exports);

  function localRequire(specifier: string) {
    if (specifier === "react") {
      return {
        ...React,
        useRef: () => ({ current: { click: inputClick } }),
        useState: <TState,>(initial: TState) => [initial, () => undefined],
      };
    }
    const sourcePath = resolveSourceModule(specifier, absolutePath);
    if (sourcePath) return loadModule(sourcePath, inputClick, cache);
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

type UploadPaneModule = {
  default: (props: {
    activeFace: LensFace;
    uploads: Partial<Record<LensFace, { fileName: string; fileSize?: number | null; previewUrl: string | null }>>;
    cardIdentity: string;
    onActiveFaceChange: (face: LensFace) => void;
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

function renderUploadedPane(inputClick: () => void, activeFace: LensFace = "front") {
  const uploadPane = loadModule<UploadPaneModule>("src/components/lens/UploadPane.tsx", inputClick);
  return uploadPane.default({
    activeFace,
    uploads: {
      [activeFace]: {
        fileName: `${activeFace}.jpg`,
        fileSize: 1024 * 1024,
        previewUrl: `blob:${activeFace}`,
      },
    },
    cardIdentity: "OP01-001",
    onActiveFaceChange: () => undefined,
    onCardIdentityChange: () => undefined,
    onFileSelect: () => undefined,
    onClearFace: () => undefined,
    onMeasure: () => undefined,
  });
}

function replaceTarget(root: React.ReactElement) {
  const target = walkElements(root).find((element) => element.props["aria-label"] === "Replace front card image");
  assert.ok(target);
  return target;
}

function replaceButton(root: React.ReactElement) {
  const button = walkElements(root).find((element) => element.type === "button" && textContent(element.props.children).trim() === "Replace");
  assert.ok(button);
  return button;
}

test("UploadPane image shortcut opens the same file picker as Replace", () => {
  let inputClicks = 0;
  const root = renderUploadedPane(() => {
    inputClicks += 1;
  });
  const target = replaceTarget(root);
  const button = replaceButton(root);

  assert.equal(target.props.onClick, button.props.onClick);
  target.props.onClick();
  button.props.onClick();
  assert.equal(inputClicks, 2);
});

test("UploadPane image shortcut supports Enter and Space", () => {
  let inputClicks = 0;
  let prevented = 0;
  const root = renderUploadedPane(() => {
    inputClicks += 1;
  });
  const target = replaceTarget(root);

  target.props.onKeyDown({ key: "Enter", preventDefault: () => { prevented += 1; } });
  target.props.onKeyDown({ key: " ", preventDefault: () => { prevented += 1; } });

  assert.equal(inputClicks, 2);
  assert.equal(prevented, 2);
});

test("UploadPane Replace button triggers one file picker click", () => {
  let inputClicks = 0;
  const root = renderUploadedPane(() => {
    inputClicks += 1;
  });

  replaceButton(root).props.onClick();

  assert.equal(inputClicks, 1);
});

test("UploadPane uploaded image target exposes hover affordance styling", () => {
  const root = renderUploadedPane(() => undefined);
  const target = replaceTarget(root);
  const hint = walkElements(target).find(
    (element) => element.type === "span" && textContent(element.props.children).trim() === "Click to replace"
  );

  assert.match(target.props.className, /cursor-pointer/);
  assert.match(target.props.className, /hover:border-owl/);
  assert.ok(hint);
  assert.match(hint.props.className, /group-hover:opacity-100/);
});
