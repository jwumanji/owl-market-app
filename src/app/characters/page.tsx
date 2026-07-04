import CharactersClient, { type CharacterData } from "./CharactersClient";
import { CHARACTERS as FALLBACK_CHARS } from "./characters-data";
import { loadCharactersPageData } from "./characters-index-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gameQueryValue } from "@/lib/game-routes";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

// Per-character accent palette — dynamic, not semantic. Hues shifted to
// read well on cream (closer to brand sunset stops + Option-A jewel tones).
const PALETTE = [
  { color: "#C42A45", colorD: "rgba(196,42,69,0.14)",  colorBd: "rgba(196,42,69,0.32)"  }, // secret-red
  { color: "#2D8A57", colorD: "rgba(45,138,87,0.16)",  colorBd: "rgba(45,138,87,0.32)"  }, // sr-green
  { color: "#2E6FD6", colorD: "rgba(46,111,214,0.14)", colorBd: "rgba(46,111,214,0.32)" }, // aa-blue
  { color: "#E89512", colorD: "rgba(232,149,18,0.16)", colorBd: "rgba(232,149,18,0.38)" }, // gold
  { color: "#6E3AA6", colorD: "rgba(110,58,166,0.14)", colorBd: "rgba(110,58,166,0.32)" }, // sp-purple
  { color: "#C43F7E", colorD: "rgba(196,63,126,0.14)", colorBd: "rgba(196,63,126,0.32)" }, // sar-pink
  { color: "#137A8C", colorD: "rgba(19,122,140,0.14)", colorBd: "rgba(19,122,140,0.32)" }, // l-teal
];

function generateSparkFromChange(chg7d: number, chg30d: number): number[] {
  const base = 10;
  const trend = chg30d / 100;
  const pts: number[] = [];
  let p = base * (1 - trend * 0.5);
  for (let i = 0; i < 13; i++) {
    p += (trend * base) / 13 + (Math.random() - 0.45) * 0.5;
    pts.push(+Math.max(p, 1).toFixed(1));
  }
  // nudge final point to reflect 7d direction
  pts[pts.length - 1] = pts[pts.length - 2] + (chg7d > 0 ? 0.5 : -0.5);
  return pts;
}

// Runs on the server so the generated sparklines/accents are serialized once
// into the RSC payload — SSR markup and hydration stay in sync.
function assignColors(chars: CharacterData[]): CharacterData[] {
  return chars.map((c, i) => ({
    ...c,
    color: c.color || PALETTE[i % PALETTE.length].color,
    colorD: c.colorD || PALETTE[i % PALETTE.length].colorD,
    colorBd: c.colorBd || PALETTE[i % PALETTE.length].colorBd,
    spark: c.spark || generateSparkFromChange(c.chg7d, c.chg30d),
  }));
}

export default async function CharactersPage({
  params,
}: {
  params?: { game?: string };
}) {
  const gameRouteSlug = params?.game ?? DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const isDefaultGame = gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

  const result = await loadCharactersPageData({ game: gameQueryValue(gameRouteSlug) });
  const loaded = result.ok && result.characters.length > 0 ? result.characters : null;
  // Same fallback semantics as the old client fetch: the default game keeps
  // the static index when live data is empty/unavailable; other games show
  // the "No character index yet" empty state.
  const characters = assignColors(loaded ?? (isDefaultGame ? FALLBACK_CHARS : []));

  return (
    <CharactersClient
      key={gameRouteSlug}
      characters={characters}
      gameRouteSlug={gameRouteSlug}
    />
  );
}
