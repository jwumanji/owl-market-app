import CharactersPage from "@/app/characters/page";
import { publicGameStaticParams } from "@/lib/static-game-params";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default CharactersPage;
