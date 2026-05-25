import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PUBLIC_GAME } from "@/lib/games/registry";

export const DEFAULT_PUBLIC_GAME_DB_SLUG = DEFAULT_PUBLIC_GAME.dbSlug;
export const DEFAULT_PUBLIC_GAME_ROUTE_SLUG = DEFAULT_PUBLIC_GAME.routeSlug;

export type GameScope = {
  id: string;
  slug: string;
  routeSlug: string;
  name: string;
  isActive: boolean;
  isPublic: boolean;
  metadata: Record<string, unknown>;
};

type GameRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean | null;
  is_public: boolean | null;
  metadata: Record<string, unknown> | null;
};

type ResolveGameOptions = {
  defaultToOnePiece?: boolean;
  publicOnly?: boolean;
};

export type ResolveGameResult =
  | { game: GameScope; error: null }
  | { game: null; error: { message: string; status: number } };

const GAME_SELECT = "id, slug, name, is_active, is_public, metadata";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toGameScope(row: GameRow): GameScope {
  const metadata = row.metadata ?? {};
  const routeSlug = typeof metadata.route_slug === "string" && metadata.route_slug.trim()
    ? metadata.route_slug.trim()
    : row.slug.replace(/_/g, "-");

  return {
    id: row.id,
    slug: row.slug,
    routeSlug,
    name: row.name,
    isActive: row.is_active !== false,
    isPublic: row.is_public !== false,
    metadata,
  };
}

function gamePayload(game: GameScope) {
  return {
    id: game.id,
    slug: game.slug,
    route_slug: game.routeSlug,
    name: game.name,
  };
}

export function allowsPrivateGamePreview() {
  return (
    process.env.ENABLE_PRIVATE_GAME_PREVIEW === "1" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV !== "production"
  );
}

export function publicOnlyForCatalogPreview() {
  return !allowsPrivateGamePreview();
}

export function gameResponsePayload(game: GameScope) {
  return gamePayload(game);
}

export function gameParamFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("game") ??
    searchParams.get("game_slug") ??
    searchParams.get("game_id")
  );
}

export function gameParamFromBody(body: Record<string, unknown> | null | undefined) {
  const value = body?.game ?? body?.game_slug ?? body?.game_id;
  return typeof value === "string" ? value : null;
}

async function queryGameBySlug(supabase: SupabaseClient, slug: string) {
  return supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("slug", slug)
    .maybeSingle();
}

async function queryGameByRouteSlug(supabase: SupabaseClient, routeSlug: string) {
  return supabase
    .from("games")
    .select(GAME_SELECT)
    .filter("metadata->>route_slug", "eq", routeSlug)
    .maybeSingle();
}

async function queryGameById(supabase: SupabaseClient, id: string) {
  return supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("id", id)
    .maybeSingle();
}

export async function resolveGameScope(
  supabase: SupabaseClient,
  rawGame: string | null | undefined,
  options: ResolveGameOptions = {}
): Promise<ResolveGameResult> {
  const requested = rawGame?.trim() || (options.defaultToOnePiece ? DEFAULT_PUBLIC_GAME_ROUTE_SLUG : "");
  if (!requested) {
    return { game: null, error: { message: "game is required", status: 400 } };
  }

  const slugCandidates = Array.from(new Set([
    requested,
    requested.replace(/-/g, "_"),
    requested.replace(/_/g, "-"),
  ]));

  let row: GameRow | null = null;
  for (const slug of slugCandidates) {
    const { data, error } = await queryGameBySlug(supabase, slug);
    if (error) {
      return { game: null, error: { message: error.message, status: 500 } };
    }
    if (data) {
      row = data as GameRow;
      break;
    }
  }

  if (!row) {
    const { data, error } = await queryGameByRouteSlug(supabase, requested);
    if (error) {
      return { game: null, error: { message: error.message, status: 500 } };
    }
    row = (data as GameRow | null) ?? null;
  }

  if (!row && isUuid(requested)) {
    const { data, error } = await queryGameById(supabase, requested);
    if (error) {
      return { game: null, error: { message: error.message, status: 500 } };
    }
    row = (data as GameRow | null) ?? null;
  }

  if (!row) {
    return { game: null, error: { message: "Game not found", status: 404 } };
  }

  const game = toGameScope(row);
  if (!game.isActive) {
    return { game: null, error: { message: "Game is not active", status: 404 } };
  }
  if (options.publicOnly && !game.isPublic) {
    return { game: null, error: { message: "Game is not public", status: 404 } };
  }

  return { game, error: null };
}
