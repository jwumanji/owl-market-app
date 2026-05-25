import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SET_SLUG_MAP,
  classifyRarity,
  ensureSetExists,
  extractVariantLabel,
  resolveSetCode,
} from "@/lib/justtcg-match";

export {
  SET_SLUG_MAP as ONE_PIECE_JUSTTCG_SET_SLUG_MAP,
  classifyRarity,
  ensureSetExists,
  extractVariantLabel,
  resolveSetCode,
};

export const ONE_PIECE_DB_SLUG = "one_piece";
export const ONE_PIECE_ROUTE_SLUG = "one-piece";
export const ONE_PIECE_JUSTTCG_GAME_SLUG = "one-piece-card-game";
export const ONE_PIECE_OPTCGAPI_BASE_URL = "https://optcgapi.com/api";
export const ONE_PIECE_OPTCGAPI_IMAGE_BASE =
  "https://optcgapi.com/media/static/Card_Images";
export const JUSTTCG_PROVIDER = "justtcg";
export const OPTCGAPI_PROVIDER = "optcgapi";

export interface OnePieceGameRecord {
  id: string;
  slug: string;
  routeSlug: string;
  justTcgGameSlug: string;
}

export const onePieceGame = {
  dbSlug: ONE_PIECE_DB_SLUG,
  routeSlug: ONE_PIECE_ROUTE_SLUG,
  justTcgGameSlug: ONE_PIECE_JUSTTCG_GAME_SLUG,
  providers: {
    justtcg: JUSTTCG_PROVIDER,
    optcgapi: OPTCGAPI_PROVIDER,
  },
  justTcgSetSlugMap: SET_SLUG_MAP,
  classifyRarity,
  extractVariantLabel,
  parseVariant,
  resolveSetCode,
  ensureSetExists,
};

export function parseVariant(name: string): string | null {
  if (/\(Manga\)/i.test(name)) return "Manga";
  if (/\(Red Super Alternate Art\)/i.test(name)) return "Red Super Alternate Art";
  if (/\(Super Alternate Art\)/i.test(name)) return "Super Alternate Art";
  if (/\(SP\).*\(Gold\)/i.test(name)) return "SP Gold";
  if (/\(SP\).*\(Silver\)/i.test(name)) return "SP Silver";
  if (/\(SP\)/i.test(name)) return "SP";
  if (/\(SPR\)/i.test(name)) return "SP";
  if (/\(TR\)/i.test(name)) return "TR";
  if (/\(Alternate Art\)/i.test(name)) return "Alternate Art";
  if (/\(Parallel\)/i.test(name)) return "Parallel";
  if (/\(Wanted Poster\)/i.test(name)) return "Wanted Poster";
  if (/\(Gold-Stamped Signature\)/i.test(name)) return "Gold-Stamped Signature";
  if (/\(Jolly Roger Foil\)/i.test(name)) return "Jolly Roger Foil";
  if (/\(Reprint\)/i.test(name)) return "Reprint";
  return null;
}

export async function resolveOnePieceGame(
  supabase: Pick<SupabaseClient, "from">
): Promise<OnePieceGameRecord> {
  const { data, error } = await supabase
    .from("games")
    .select("id, slug, metadata")
    .eq("slug", ONE_PIECE_DB_SLUG)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "One Piece game row was not found.");
  }

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    id: data.id as string,
    slug: data.slug as string,
    routeSlug:
      typeof metadata.route_slug === "string"
        ? metadata.route_slug
        : ONE_PIECE_ROUTE_SLUG,
    justTcgGameSlug:
      typeof metadata.justtcg_game === "string"
        ? metadata.justtcg_game
        : ONE_PIECE_JUSTTCG_GAME_SLUG,
  };
}

export function buildJustTcgCodeToSlugs(
  setSlugMap: Record<string, string> = SET_SLUG_MAP
): Record<string, string[]> {
  const codeToSlugs: Record<string, string[]> = {};
  for (const [slug, code] of Object.entries(setSlugMap)) {
    if (!codeToSlugs[code]) codeToSlugs[code] = [];
    codeToSlugs[code].push(slug);
  }
  return codeToSlugs;
}

export function buildPrimaryJustTcgSlugByCode(
  codeToSlugs: Record<string, string[]>
): Record<string, string> {
  const codeToSlug: Record<string, string> = {};
  for (const [code, slugs] of Object.entries(codeToSlugs)) {
    codeToSlug[code] = slugs[0];
  }
  return codeToSlug;
}

export function catalogImageUrlForOnePieceCard(
  setCode: string,
  cardNumber: string | null | undefined,
  variantLabel: string | null
): string | null {
  if (!cardNumber) return null;
  if (setCode === "P" || variantLabel) return null;
  return `${ONE_PIECE_OPTCGAPI_IMAGE_BASE}/${cardNumber}.jpg`;
}
