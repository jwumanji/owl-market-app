import PsaImportForm from "./PsaImportForm";

export const metadata = {
  title: "PSA Import - OWL Market",
};

export default function PsaImportPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">PSA Import</h1>
          <p className="mt-2 max-w-2xl text-base text-text">
            Import PSA file exports into Graded Card inventory as individual item entries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/admin/psa-submissions"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            View Submissions
          </a>
          <a
            href="/admin/inventory"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Inventory
          </a>
        </div>
      </div>

      <PsaImportForm />
    </section>
  );
}
