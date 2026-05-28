import RaritiesPage from "@/app/rarities/page";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default RaritiesPage;
