import Link from "next/link";
import PreGradeHistorySection from "@/components/lens/PreGradeHistorySection";

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
                <h2 className="font-grotesk text-[22px] font-bold tracking-tight text-ink">{tool.title}</h2>
                <span
                  className={`inline-flex shrink-0 items-center rounded-c-sm border-[1.5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.07em] ${
                    tool.active
                      ? "border-gain-2 bg-[#DCF1E6] text-gain-2"
                      : "border-ink-3 bg-bg-3 text-ink-2"
                  }`}
                >
                  {tool.badge}
                </span>
              </div>
              <p className="mt-3 font-grotesk text-[13.5px] leading-[1.55] text-ink-2">{tool.description}</p>
            </>
          );

          return tool.active ? (
            <Link
              key={tool.title}
              href={tool.href}
              className="admin-card block p-6 transition-colors hover:bg-bg-3/40"
            >
              {content}
              <span className="admin-btn admin-btn-primary mt-5">Open tool →</span>
            </Link>
          ) : (
            <div
              key={tool.title}
              aria-disabled="true"
              className="rounded-c-md border-[1.5px] border-ink-3 bg-bg-2 p-6 opacity-[0.66]"
            >
              {content}
            </div>
          );
        })}
      </div>

      <PreGradeHistorySection />
    </section>
  );
}
