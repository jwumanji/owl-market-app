import {
  JUSTTCG_PROVIDER,
  ONE_PIECE_DB_SLUG,
  ONE_PIECE_JUSTTCG_GAME_SLUG,
  ONE_PIECE_ROUTE_SLUG,
  OPTCGAPI_PROVIDER,
} from "@/lib/games/one-piece";
import { RIFTBOUND_JUSTTCG_GAME_SLUG } from "@/lib/games/riftbound-justtcg";

export type GameAdapterStatus = "active" | "seeded" | "planned";

export type GameProviderDefinition = {
  provider: string;
  sourceGameSlug?: string;
  sourceCatalogs?: readonly {
    slug: string;
    editionCode: string;
  }[];
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
export const RIFTBOUND_DB_SLUG = "riftbound";
export const RIFTBOUND_ROUTE_SLUG = "riftbound";

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
        sourceCatalogs: [
          { slug: "pokemon", editionCode: "en-global" },
          { slug: "pokemon-japan", editionCode: "ja-jp" },
        ],
        status: "planned",
        notes: "Keep English and Japanese provider catalogs under explicit game editions.",
      },
    },
  },
  [RIFTBOUND_DB_SLUG]: {
    dbSlug: RIFTBOUND_DB_SLUG,
    routeSlug: RIFTBOUND_ROUTE_SLUG,
    name: "Riftbound",
    isPublic: true,
    status: "active",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: RIFTBOUND_JUSTTCG_GAME_SLUG,
        status: "active",
        notes: "Live exact-match Near Mint Normal pricing; unmatched provider records stay quarantined for reconciliation.",
      },
      tcgplayer: {
        provider: "tcgplayer",
        sourceGameSlug: "riftbound",
        status: "active",
        notes: "Canonical product identities and approved card-image URLs are live.",
      },
    },
  },
  magic_the_gathering: {
    dbSlug: "magic_the_gathering",
    routeSlug: "magic-the-gathering",
    name: "Magic: The Gathering",
    isPublic: false,
    status: "planned",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "magic-the-gathering",
        status: "planned",
      },
    },
  },
  lorcana: {
    dbSlug: "lorcana",
    routeSlug: "lorcana",
    name: "Disney Lorcana",
    isPublic: false,
    status: "planned",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "disney-lorcana",
        status: "planned",
      },
    },
  },
  gundam: {
    dbSlug: "gundam",
    routeSlug: "gundam",
    name: "Gundam Card Game",
    isPublic: false,
    status: "planned",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "gundam-card-game",
        status: "planned",
      },
    },
  },
  dragon_ball_fusion_world: {
    dbSlug: "dragon_ball_fusion_world",
    routeSlug: "dragon-ball-fusion-world",
    name: "Dragon Ball Super: Fusion World",
    isPublic: false,
    status: "planned",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "dragon-ball-super-fusion-world",
        status: "planned",
      },
    },
  },
  dragon_ball_masters: {
    dbSlug: "dragon_ball_masters",
    routeSlug: "dragon-ball-masters",
    name: "Dragon Ball Super: Masters",
    isPublic: false,
    status: "planned",
    providers: {
      justtcg: {
        provider: JUSTTCG_PROVIDER,
        sourceGameSlug: "dragon-ball-super-masters",
        status: "planned",
      },
    },
  },
  naruto_card_game: {
    dbSlug: "naruto_card_game",
    routeSlug: "naruto-card-game",
    name: "Naruto Card Game",
    isPublic: false,
    status: "planned",
    providers: {},
  },
} as const satisfies Record<string, GameDefinition>;

export const DEFAULT_PUBLIC_GAME = GAME_DEFINITIONS[ONE_PIECE_DB_SLUG];
export const HIDDEN_GAME_DEFINITIONS = Object.values(GAME_DEFINITIONS).filter(
  (game) => !game.isPublic
);

export function getGameDefinitionByDbSlug(slug: string) {
  return GAME_DEFINITIONS[slug as keyof typeof GAME_DEFINITIONS] ?? null;
}

export function getGameDefinitionByRouteSlug(routeSlug: string) {
  const normalized = routeSlug.trim();
  return Object.values(GAME_DEFINITIONS).find((game) => game.routeSlug === normalized) ?? null;
}
