import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(repoRoot, "contracts", "owl-lens.openapi.yaml");
const generatedPath = path.join(
  repoRoot,
  "src",
  "lib",
  "owl-lens",
  "openapi.generated.ts"
);
const tempPath = path.join(
  tmpdir(),
  `owl-lens-openapi-${process.pid}-${Date.now()}.generated.ts`
);
const require = createRequire(import.meta.url);
const openApiTypescriptCli = require.resolve("openapi-typescript/bin/cli.js");

if (!existsSync(contractPath)) {
  console.error(
    "contracts/owl-lens.openapi.yaml does not exist. Run npm run owl-lens:sync-contract first."
  );
  process.exit(1);
}

execFileSync(process.execPath, [openApiTypescriptCli, contractPath, "-o", tempPath], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (!existsSync(generatedPath)) {
  console.error("src/lib/owl-lens/openapi.generated.ts does not exist.");
  console.error("Run npm run owl-lens:generate-types and commit the generated file.");
  console.error(`Regenerated comparison file is available at: ${tempPath}`);
  process.exit(1);
}

const [expected, actual] = await Promise.all([
  readFile(generatedPath, "utf8"),
  readFile(tempPath, "utf8"),
]);

if (expected !== actual) {
  console.error("Generated Owl Lens OpenAPI types are out of date.");
  console.error("Run npm run owl-lens:generate-types and commit src/lib/owl-lens/openapi.generated.ts.");
  console.error(`Regenerated comparison file is available at: ${tempPath}`);
  process.exit(1);
}

await unlink(tempPath);
console.log("Owl Lens OpenAPI generated types are current.");
