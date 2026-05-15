import Link from "next/link";
import CenteringWorkspace from "@/components/centering/CenteringWorkspace";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pre-grade - Owl Lens - OWL Market",
};

const HISTORY_PAGE_SIZE = 20;

type CenteringMeasurementRow = {
  id: string;
  created_at: string | null;
  left_pct: string | number | null;
  right_pct: string | number | null;
  top_pct: string | number | null;
  bottom_pct: string | number | null;
  worst_axis: "leftRight" | "topBottom";
  worst_axis_max_pct: string | number | null;
  psa_ceiling: "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";
};

type HistoryPage = {
  rows: CenteringMeasurementRow[];
  count: number;
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  error: string | null;
};

function pageFromSearchParams(searchParams?: { page?: string | string[] }) {
  const raw = Array.isArray(searchParams?.page) ? searchParams?.page[0] : searchParams?.page;
  const page = Number(raw ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function formatPercent(value: string | number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "--";
}

function formatMeasurementDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function ceilingClassName(ceiling: CenteringMeasurementRow["psa_ceiling"]) {
  if (ceiling === "PSA_10") {
    return "border-gain/40 bg-gain/10 text-gain";
  }
  if (ceiling === "PSA_9" || ceiling === "PSA_8") {
    return "border-owl/40 bg-owl/10 text-owl";
  }
  return "border-loss/40 bg-loss/10 text-loss";
}

async function loadPregradeHistory(page: number): Promise<HistoryPage> {
  const supabase = createServiceClient();
  const from = (page - 1) * HISTORY_PAGE_SIZE;
  const to = from + HISTORY_PAGE_SIZE - 1;
  const measurementRes = await supabase
    .from("centering_measurements")
    .select(
      "id, created_at, left_pct, right_pct, top_pct, bottom_pct, worst_axis, worst_axis_max_pct, psa_ceiling",
      { count: "exact" }
    )
    .is("inventory_item_id", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  const count = measurementRes.error ? 0 : measurementRes.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / HISTORY_PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);

  return {
    rows: (measurementRes.error ? [] : measurementRes.data ?? []) as CenteringMeasurementRow[],
    count,
    page: clampedPage,
    pageCount,
    hasPrevious: clampedPage > 1,
    hasNext: clampedPage < pageCount,
    error: measurementRes.error?.message ?? null,
  };
}

function historyHref(page: number) {
  return `/admin/lens/pregrade?page=${page}`;
}

function PregradeHistory({ history }: { history: HistoryPage }) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs font-bold uppercase text-owl">Pre-grade History</div>
          <h2 className="mt-1 text-2xl font-bold text-text">Standalone measurements</h2>
        </div>
        <div className="font-mono text-xs font-semibold uppercase text-text-2">
          Page {history.page} of {history.pageCount}
        </div>
      </div>

      {history.error && (
        <div className="mt-5 rounded-md border border-loss/40 bg-loss/10 p-4 text-sm text-text">
          Pre-grade history is unavailable.
          <div className="mt-2 font-mono text-xs text-text-2">{history.error}</div>
        </div>
      )}

      {!history.error && history.rows.length === 0 && (
        <div className="mt-5 rounded-md border border-dashed border-border-2 bg-deep p-6 text-sm text-text-2">
          No standalone pre-grade measurements yet.
        </div>
      )}

      {!history.error && history.rows.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-deep font-mono text-xs uppercase text-text-2">
              <tr>
                <th className="px-3 py-2">Measured</th>
                <th className="px-3 py-2">Ceiling</th>
                <th className="px-3 py-2">L / R</th>
                <th className="px-3 py-2">T / B</th>
                <th className="px-3 py-2">Worst axis</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((measurement) => (
                <tr key={measurement.id} className="border-t border-border">
                  <td className="px-3 py-3 font-mono text-xs text-text-2">
                    {formatMeasurementDate(measurement.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold uppercase ${ceilingClassName(
                        measurement.psa_ceiling
                      )}`}
                    >
                      {measurement.psa_ceiling}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-text">
                    {formatPercent(measurement.left_pct)} / {formatPercent(measurement.right_pct)}
                  </td>
                  <td className="px-3 py-3 font-mono text-text">
                    {formatPercent(measurement.top_pct)} / {formatPercent(measurement.bottom_pct)}
                  </td>
                  <td className="px-3 py-3 text-text">
                    {measurement.worst_axis === "leftRight" ? "Left/right" : "Top/bottom"} at{" "}
                    {formatPercent(measurement.worst_axis_max_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {history.hasPrevious ? (
          <Link
            href={historyHref(history.page - 1)}
            className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
          >
            Previous pre-grades
          </Link>
        ) : (
          <span />
        )}
        {history.hasNext ? (
          <Link
            href={historyHref(history.page + 1)}
            className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
          >
            Next pre-grades
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}

export default async function PregradePage({
  searchParams,
}: {
  searchParams?: { page?: string | string[] };
}) {
  const page = pageFromSearchParams(searchParams);
  const history = await loadPregradeHistory(page);

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase text-owl">Owl Lens</p>
          <h1 className="text-4xl font-bold text-text">Pre-grade</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-text-2">
            Measure centering before the card becomes inventory. Results are stored without image bytes or an inventory link.
          </p>
        </div>
        <Link
          href="/admin/lens"
          className="rounded-md border border-border bg-surface px-4 py-2.5 text-center font-mono text-sm font-bold uppercase text-text transition-colors hover:border-border-2 hover:text-owl"
        >
          Back to Owl Lens
        </Link>
      </div>

      <CenteringWorkspace
        cardIdentity={{
          name: "Standalone pre-grade",
        }}
      />

      <PregradeHistory history={history} />
    </section>
  );
}
