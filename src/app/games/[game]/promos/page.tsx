import { redirect } from "next/navigation";
import { gamePath } from "@/lib/game-routes";

export const dynamic = "force-dynamic";

export default async function GamePromosPage(
  props: {
    params: Promise<{ game: string }>;
  }
) {
  const params = await props.params;
  redirect(`${gamePath(params.game, "/catalog")}?variant=PROMO`);
}
