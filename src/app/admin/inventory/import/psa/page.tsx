import PsaImportForm from "./PsaImportForm";

export const metadata = {
  title: "PSA Import - OWL Market",
};

type PsaImportSearchParams = {
  game?: string | string[];
};

function getInitialGame(searchParams?: PsaImportSearchParams) {
  const game = Array.isArray(searchParams?.game) ? searchParams?.game[0] : searchParams?.game;
  return game?.trim() || undefined;
}

export default async function PsaImportPage({
  searchParams,
}: {
  searchParams?: PsaImportSearchParams | Promise<PsaImportSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gameSlug = getInitialGame(resolvedSearchParams);
  const gameQuery = gameSlug ? `?game=${encodeURIComponent(gameSlug)}` : "";

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">PSA Import</h1>
          <p className="admin-subline">
            Import PSA file exports into Graded Card inventory as individual item entries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/psa-submissions${gameQuery}`} className="admin-btn admin-btn-ghost">
            View Submissions
          </a>
          <a href={`/admin/inventory${gameQuery}`} className="admin-btn admin-btn-ghost">
            Back to Inventory
          </a>
        </div>
      </div>

      <PsaImportForm gameSlug={gameSlug} />
    </section>
  );
}
