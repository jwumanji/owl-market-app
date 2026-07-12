import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { synchronizeCharacterIndex } from "../src/lib/character-index-sync";

function loadEnvFile(file = path.resolve(process.cwd(), ".env.local")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] == null) process.env[key] = value;
  }
}

function argument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("This command rebuilds live character profiles and links. Re-run with --apply.");
  }
  loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service credentials.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gameSlug = argument("game", "one_piece");
  const { data: game, error } = await supabase
    .from("games")
    .select("id, slug")
    .eq("slug", gameSlug)
    .single();
  if (error || !game) throw new Error(error?.message ?? `Unknown game: ${gameSlug}`);

  console.log(JSON.stringify(await synchronizeCharacterIndex(supabase, game), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
