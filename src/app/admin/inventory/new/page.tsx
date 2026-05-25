import NewInventoryForm from "./NewInventoryForm";

export const metadata = {
  title: "Add Inventory - OWL Market",
};

type NewInventorySearchParams = {
  game?: string | string[];
};

function getInitialGame(searchParams?: NewInventorySearchParams) {
  const game = Array.isArray(searchParams?.game) ? searchParams?.game[0] : searchParams?.game;
  return game?.trim() || undefined;
}

export default async function NewInventoryPage({
  searchParams,
}: {
  searchParams?: NewInventorySearchParams | Promise<NewInventorySearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gameSlug = getInitialGame(resolvedSearchParams);

  return (
    <section className="mx-auto max-w-[1100px] pl-7 pr-7 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Add Inventory</h1>
          <p className="admin-subline">
            Search the card catalog, then create itemized inventory entries for your store.
          </p>
        </div>
      </div>

      <NewInventoryForm gameSlug={gameSlug} />
    </section>
  );
}
