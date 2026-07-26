import { redirect } from "next/navigation";

import { gamePath } from "@/lib/game-routes";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";

export default function LegacyNewsPage() {
  redirect(gamePath(DEFAULT_PUBLIC_GAME_ROUTE_SLUG, "/news"));
}
