import Link from "next/link";
import LensComposersDev from "@/components/lens/LensComposersDev";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Owl Lens Dev - Moon Market",
};

export default function LensDevPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-8">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">
            Owl Lens · Dev
          </p>
          <h1 className="text-3xl font-bold text-text">Image overlay checkpoint</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-2">
            Isolated harness for the Pre-grade SVG overlay and Step 3 composer components.
          </p>
        </div>
        <Link
          href="/admin/lens"
          className="rounded-md border border-border bg-surface px-4 py-2.5 text-center font-mono text-sm font-bold uppercase text-text transition-colors hover:border-border-2 hover:text-owl"
        >
          Back to Owl Lens
        </Link>
      </div>
      <LensComposersDev />
    </section>
  );
}
