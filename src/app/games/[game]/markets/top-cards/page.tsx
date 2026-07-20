import Link from "next/link";

import { gamePath } from "@/lib/game-routes";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = 900;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export const metadata = {
  title: "Top Cards — Moon Market",
  description: "The full Moon Market card value ranking.",
};

export default async function TopCardsPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;

  return (
    <section className="min-h-screen bg-bg px-7 pb-24 pt-10 text-ink">
      <div className="mx-auto max-w-[1184px] rounded-c-md border-[1.5px] border-ink bg-bg-2 p-8">
        <div className="mb-3 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
          Full ranking · Coming next
        </div>
        <h1 className="font-grotesk text-[38px] font-bold leading-tight tracking-[-0.025em]">
          Top <em className="inline-block bg-grad-brand bg-clip-text pb-1 pr-3 font-script text-[48px] not-italic text-transparent">cards</em>
        </h1>
        <p className="mt-3 max-w-[680px] font-mono-2 text-[13px] font-semibold leading-6 text-ink-2">
          The expanded top-50 view is being prepared. The Quick Dash already shows the ten highest-value cards across the catalog.
        </p>
        <Link
          href={gamePath(game, "/markets")}
          className="mt-6 inline-flex rounded-c-pill border-[1.5px] border-ink bg-ink px-5 py-2.5 font-mono-2 text-[11px] font-bold uppercase tracking-[0.06em] text-bg no-underline"
          prefetch={false}
        >
          Back to markets
        </Link>
      </div>
    </section>
  );
}
