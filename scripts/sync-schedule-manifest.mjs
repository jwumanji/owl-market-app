import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config", "game-sync-jobs.json");
const vercelPath = path.join(root, "vercel.json");
const write = process.argv.includes("--write");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));

function cronKey(cron) {
  return cron.path + "\n" + cron.schedule;
}

function isGameSyncCron(cron) {
  if (!cron.path.startsWith("/api/sync/")) return false;
  const url = new URL(cron.path, "https://owl.internal");
  return url.searchParams.has("game");
}

const errors = [];
const ids = new Set();
const declaredCrons = [];

for (const job of manifest.jobs ?? []) {
  if (!job.id || ids.has(job.id)) errors.push("Duplicate or missing job id: " + String(job.id));
  ids.add(job.id);

  const url = new URL(job.path, "https://owl.internal");
  if (url.searchParams.get("game") !== job.game) {
    errors.push(job.id + " path game does not match manifest game");
  }
  if (!Array.isArray(job.schedules) || job.schedules.length === 0) {
    errors.push(job.id + " has no schedules");
  }
  for (const schedule of job.schedules ?? []) {
    declaredCrons.push({ path: job.path, schedule });
  }
}

const declaredKeys = new Set(declaredCrons.map(cronKey));
if (declaredKeys.size !== declaredCrons.length) {
  errors.push("Manifest contains duplicate path/schedule pairs");
}

if (write && errors.length === 0) {
  const unmanagedCrons = (vercel.crons ?? []).filter((cron) => !isGameSyncCron(cron));
  vercel.crons = [...declaredCrons, ...unmanagedCrons];
  fs.writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");
}

const actualGameCrons = (vercel.crons ?? []).filter(isGameSyncCron);
const actualKeys = new Set(actualGameCrons.map(cronKey));

for (const cron of declaredCrons) {
  if (!actualKeys.has(cronKey(cron))) {
    errors.push("Missing Vercel cron: " + cron.path + " @ " + cron.schedule);
  }
}
for (const cron of actualGameCrons) {
  if (!declaredKeys.has(cronKey(cron))) {
    errors.push("Unmanaged game cron: " + cron.path + " @ " + cron.schedule);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log(
    "Game sync schedule PASS: " +
      manifest.jobs.length +
      " jobs / " +
      declaredCrons.length +
      " Vercel cron entries"
  );
}
