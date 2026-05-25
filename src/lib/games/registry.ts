import {
  JUSTTCG_PROVIDER,
  ONE_PIECE_DB_SLUG,
  ONE_PIECE_JUSTTCG_GAME_SLUG,
  ONE_PIECE_ROUTE_SLUG,
  OPTCGAPI_PROVIDER,
} from "@/lib/games/one-piece";

export type GameAdapterStatus = "active" | "seeded" | "planned";

export type GameProviderDefinition = {
  provider: string;
  sourceGameSlug: string;
  status: GameAdapterStatus;
  notes?: string;
};

export type GameDefinition = {
  dbSlug: string;
  routeSlug: string;
  name: string;
  isPublic: boolean;
  status: GameAdapterStatus;
  providers: Record<string, GameProviderDefinition>;
};

export const POKEMON_DB_SLUG = "pokemon";
export const POKEMON_ROUTE_SLUG = "pokemon";

export const GAME_DEFINITIONS = {
  [ONE_PIECE_DB_SLUG]: {
    dbSlug: ONE_PIECE_DB_SLUG,
    routeSlug: ONE_PIECE_ROUTE_SLUG,
    name: "One Piece Card Game",
    isPublic: true,
    status: "active",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: ONE_PIECE_JUSTTCG_GAME_SLUG,
        status: "active",
      },
      optcgapi: {
        provider: OPTCGAPI_PROVIDER,
        sourceGameSlug: "one_piece",
        status: "active",
      },
    },
  },
  [POKEMON_DB_SLUG]: {
    dbSlug: POKEMON_DB_SLUG,
    routeSlug: POKEMON_ROUTE_SLUG,
    name: "Pokemon TCG",
    isPublic: false,
    status: "seeded",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "pokemon",
        status: "planned",
        notes: "Provider slug and product mapping must be verified before enabling sync.",
      },
    },
  },
} as const satisfies Record<string, GameDefinition>;

export const DEFAULT_PUBLIC_GAME = GAME_DEFINITIONS[ONE_PIECE_DB_SLUG];
export const HIDDEN_GAME_DEFINITIONS = [GAME_DEFINITIONS[POKEMON_DB_SLUG]] as const;

export function getGameDefinitionByDbSlug(slug: string) {
  return GAME_DEFINITIONS[slug as keyof typeof GAME_DEFINITIONS] ?? null;
}

export function getGameDefinitionByRouteSlug(routeSlug: string) {
  const normalized = routeSlug.trim();
  return Object.values(GAME_DEFINITIONS).find((game) => game.routeSlug === normalized) ?? null;
}
