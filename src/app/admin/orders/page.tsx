import { redirect } from "next/navigation";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders - OWL Market",
};

type OrdersSearchParams = {
  game?: string | string[];
};

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage(
  props: {
    searchParams?: Promise<OrdersSearchParams | Promise<OrdersSearchParams>>;
  }
) {
  const searchParams = await props.searchParams;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gameSlug = searchParamValue(resolvedSearchParams?.game)?.trim() || DEFAULT_PUBLIC_GAME_DB_SLUG;

  redirect(`/admin/inventory?game=${encodeURIComponent(gameSlug)}&status=ship`);
}
