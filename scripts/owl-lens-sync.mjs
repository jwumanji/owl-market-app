import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(repoRoot, "contracts", "owl-lens.openapi.yaml");
const localRoot = process.env.OWL_LENS_LOCAL_PATH?.trim();
const localContract = localRoot
  ? path.join(localRoot, "contracts", "openapi.yaml")
  : null;
const rawUrl =
  "https://raw.githubusercontent.com/jwumanji/owl-lens/main/contracts/openapi.yaml";

const attempts = [];

async function ensureDestinationDir() {
  await mkdir(path.dirname(destination), { recursive: true });
}

function printFailure() {
  console.error("Could not sync Owl Lens OpenAPI contract.");
  console.error("");
  console.error("Attempted sources:");
  for (const attempt of attempts) {
    console.error(`- ${attempt}`);
  }
  console.error("");
  console.error("Next steps:");
  console.error(
    "- Set OWL_LENS_LOCAL_PATH to an absolute jwumanji/owl-lens checkout that contains contracts/openapi.yaml, then rerun npm run owl-lens:sync-contract."
  );
  console.error(
    "- Or wait for jwumanji/owl-lens to publish contracts/openapi.yaml on main, then rerun npm run owl-lens:sync-contract."
  );
}

if (localContract && existsSync(localContract)) {
  await ensureDestinationDir();
  await copyFile(localContract, destination);
  console.log(`Synced Owl Lens OpenAPI contract from local path: ${localContract}`);
  console.log(`Wrote ${destination}`);
} else {
  attempts.push(
    localContract
      ? `Local: ${localContract} (missing)`
      : "Local: OWL_LENS_LOCAL_PATH is not set (expected <path>/contracts/openapi.yaml)"
  );

  try {
    const response = await fetch(rawUrl);
    if (!response.ok) {
      attempts.push(`Remote: ${rawUrl} (HTTP ${response.status} ${response.statusText})`);
      printFailure();
      process.exitCode = 1;
    } else {
      const body = await response.text();
      if (!body.trim() || body.trim() === "404: Not Found") {
        attempts.push(`Remote: ${rawUrl} (missing or empty response)`);
        printFailure();
        process.exitCode = 1;
      } else {
        await ensureDestinationDir();
        await writeFile(destination, body);
        console.log(`Synced Owl Lens OpenAPI contract from remote URL: ${rawUrl}`);
        console.log(`Wrote ${destination}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push(`Remote: ${rawUrl} (${message})`);
    printFailure();
    process.exitCode = 1;
  }
}
