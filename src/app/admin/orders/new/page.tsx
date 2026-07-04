import Link from "next/link";
import OrderForm from "../OrderForm";
import { loadOrderInventory } from "../order-data";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add Order - OWL Market",
};

type NewOrderSearchParams = {
  game?: string | string[];
};

function getInitialGame(searchParams?: NewOrderSearchParams) {
  const game = Array.isArray(searchParams?.game) ? searchParams?.game[0] : searchParams?.game;
  return game?.trim() || DEFAULT_PUBLIC_GAME_DB_SLUG;
}

export default async function NewOrderPage(
  props: {
    searchParams?: Promise<NewOrderSearchParams | Promise<NewOrderSearchParams>>;
  }
) {
  const searchParams = await props.searchParams;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gameSlug = getInitialGame(resolvedSearchParams);
  const { data: inventoryItems, error } = await loadOrderInventory(undefined, gameSlug);
  const encodedGameSlug = encodeURIComponent(gameSlug);

  return (
    <section className="mx-auto max-w-[1600px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Add Order</h1>
          <p className="admin-subline">
            Search inventory, bundle selected cards, and create a customer order for shipping.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/inventory?game=${encodedGameSlug}&status=ship`} className="admin-btn admin-btn-ghost">
            Back to Inventory
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Orders are not ready yet: {error}. Run schema-migration-v18-customer-orders.sql and{" "}
          schema-migration-v37-customer-order-game-scope.sql in Supabase.
        </div>
      ) : (
        <OrderForm inventoryItems={inventoryItems} gameSlug={gameSlug} />
      )}
    </section>
  );
}
