#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(repoRoot, ".tmp", "centering-smoke-tests");

const smokeTestFiles = [
  "__tests__/components/centering-workspace.test.ts",
  "__tests__/api/centering-measure.test.ts",
  "__tests__/app/inventory-centering-page.test.ts",
  "__tests__/app/lens-pages.test.ts",
  "__tests__/app/inventory-psa10-filter.test.ts",
];

const compilerOptions = {
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ES2022,
  target: ts.ScriptTarget.ES2022,
};

const diagnosticHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => repoRoot,
  getNewLine: () => "\n",
};

function compiledFileName(testFile) {
  return `${testFile.replace(/[\\/]/g, "__").replace(/\.tsx?$/, "")}.mjs`;
}

function compileSmokeTests() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  return smokeTestFiles.map((testFile) => {
    const sourcePath = path.join(repoRoot, testFile);
    const source = fs.readFileSync(sourcePath, "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions,
      fileName: sourcePath,
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics ?? []).filter((diagnostic) => (
      diagnostic.category === ts.DiagnosticCategory.Error
    ));
    if (errors.length > 0) {
      console.error(ts.formatDiagnosticsWithColorAndContext(errors, diagnosticHost));
      process.exit(1);
    }

    const outputPath = path.join(outputDir, compiledFileName(testFile));
    fs.writeFileSync(outputPath, result.outputText, "utf8");
    return outputPath;
  });
}

const compiledFiles = compileSmokeTests();
const forwardedArgs = process.argv.slice(2);
const nodeArgs = ["--test", ...forwardedArgs, ...compiledFiles];

console.log(`Running centering smoke suite (${smokeTestFiles.length} files)`);
for (const testFile of smokeTestFiles) {
  console.log(`- ${testFile}`);
}

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: repoRoot,
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "test" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`Centering smoke suite stopped by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
