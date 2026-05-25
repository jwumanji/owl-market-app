export const DEFAULT_ONE_PIECE_DB_SLUG = "one_piece";

export function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

export function scriptGameSlug(defaultSlug = DEFAULT_ONE_PIECE_DB_SLUG) {
  return readArg("--game") ?? process.env.OWL_GAME_SLUG ?? defaultSlug;
}

export async function loadGameScope({
  supabaseUrl,
  supabaseKey,
  gameSlug = scriptGameSlug(),
}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL or service role key");
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/games?select=id,slug,name&slug=eq.${encodeURIComponent(gameSlug)}`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Supabase game lookup failed: ${res.status} ${await res.text()}`);
  }

  const rows = await res.json();
  const game = rows[0];
  if (!game?.id) {
    throw new Error(`Game scope '${gameSlug}' was not found. Run the multi-TCG game migration first.`);
  }

  return game;
}

export function withGameFilter(path, gameId) {
  if (!gameId || path.includes("game_id=eq.")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}game_id=eq.${encodeURIComponent(gameId)}`;
}
