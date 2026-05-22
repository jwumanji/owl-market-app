import Link from "next/link";

export const metadata = {
  title: "Owl Lens - OWL Market",
};

const TOOLS = [
  {
    title: "Pre-grade",
    description: "Run a standalone centering measurement before deciding whether to create inventory.",
    href: "/admin/lens/pregrade",
    badge: "Active",
    active: true,
  },
  {
    title: "Inventory import",
    description: "Bulk ingest scans and prepare inventory records from detected cards.",
    badge: "Coming next",
    active: false,
  },
  {
    title: "Multi-card scan (4-9 cards)",
    description: "Detect several cards in one scan and split them into individual review jobs.",
    badge: "Coming later",
    active: false,
  },
  {
    title: "Front + back centering",
    description: "Measure both sides and compare complete grading risk before submission.",
    badge: "Coming later",
    active: false,
  },
] as const;

export default function AdminLensPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Owl Lens</h1>
          <p className="admin-subline">
            A suite of scan-based tools for pre-grading, inventory intake, and centering review.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-bold text-text">{tool.title}</h2>
                <span
                  className={`rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold uppercase ${
                    tool.active
                      ? "border-owl/40 bg-owl/10 text-owl"
                      : "border-border bg-deep text-text-2"
                  }`}
                >
                  {tool.badge}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-text-2">{tool.description}</p>
            </>
          );

          return tool.active ? (
            <Link
              key={tool.title}
              href={tool.href}
              className="rounded-lg border border-owl/50 bg-surface p-5 transition-colors hover:border-owl hover:bg-surf2"
            >
              {content}
              <div className="mt-5 inline-flex rounded-md bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase text-void">
                Open tool
              </div>
            </Link>
          ) : (
            <div key={tool.title} aria-disabled="true" className="rounded-lg border border-border bg-surface p-5 opacity-70">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
