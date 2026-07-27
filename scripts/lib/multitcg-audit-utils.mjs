import fs from "node:fs";
import path from "node:path";

export function readArg(name, fallback = null) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

export function hasFlag(name) {
  return process.argv.includes(name);
}

export function loadEnvFile(filePath = ".env.local") {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

export function projectRefFromUrl(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function assertExpectedProject(supabaseUrl, expectedRef) {
  const actualRef = projectRefFromUrl(supabaseUrl);
  if (expectedRef && expectedRef !== actualRef) {
    throw new Error(`Expected Supabase project ${expectedRef}, but URL targets ${actualRef}`);
  }
  return actualRef;
}

export function restHeaders(supabaseKey, extra = {}) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    ...extra,
  };
}

export async function sbFetchAll({ supabaseUrl, supabaseKey, resource, pageSize = 1000 }) {
  const rows = [];
  let from = 0;
  while (true) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
      method: "GET",
      headers: restHeaders(supabaseKey, { Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!response.ok) {
      throw new Error(`GET ${resource} failed: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function sbCount({ supabaseUrl, supabaseKey, resource }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    method: "GET",
    headers: restHeaders(supabaseKey, {
      Range: "0-0",
      Prefer: "count=exact",
    }),
  });
  if (!response.ok) {
    throw new Error(`COUNT ${resource} failed: ${response.status} ${await response.text()}`);
  }
  const contentRange = response.headers.get("content-range") ?? "";
  const total = Number(contentRange.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`COUNT ${resource} returned ${contentRange}`);
  return total;
}

export async function probeResource({ supabaseUrl, supabaseKey, table, columns }) {
  const resource = `${table}?select=${encodeURIComponent(columns)}&limit=1`;
  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    method: "GET",
    headers: restHeaders(supabaseKey),
  });
  if (response.ok) return { table, ok: true, error: null };
  return { table, ok: false, error: `${response.status} ${await response.text()}` };
}

export function encodeIn(values) {
  return `(${values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(",")})`;
}

export function indexBy(rows, key = "id") {
  return new Map(rows.filter((row) => row[key] != null).map((row) => [row[key], row]));
}

export function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function duplicateKeys(rows, keyFn) {
  return Array.from(countBy(rows, keyFn).entries())
    .filter(([key, count]) => key && count > 1)
    .map(([key, count]) => ({ key, count }));
}

export function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function mdTable(headers, rows) {
  if (rows.length === 0) return "_None._";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`),
  ].join("\n");
}

export function writeReport(filePath, content) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`);
}

export function requiredSupabaseEnv() {
  loadEnvFile();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl, supabaseKey };
}
