import CharactersPage from "@/app/characters/page";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default CharactersPage;
