import Link from "next/link";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PSA Submissions - OWL Market",
};

type PsaSubmissionRow = {
  id: string;
  name: string;
  source_filename: string | null;
  submitted_at: string | null;
  total_rows: number | null;
  imported_count: number | null;
  matched_count: number | null;
  pending_match_count: number | null;
  skipped_duplicate_count: number | null;
  created_at: string | null;
};

type PsaSubmissionItemRow = {
  submission_id: string;
  row_number: number | null;
  inventory_item_id: string | null;
  certification_number: string | null;
  graded_rating: string | null;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  matched: boolean | null;
  skipped_duplicate: boolean | null;
  image_status: string | null;
  result_status: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function resultLabel(item: PsaSubmissionItemRow) {
  if (item.skipped_duplicate) return "Skipped";
  if (item.result_status === "needs_match" || !item.matched) return "Needs Match";
  return "Matched";
}

function resultClassName(item: PsaSubmissionItemRow) {
  if (item.skipped_duplicate) return "border-border bg-surf2 text-text-2";
  if (item.result_status === "needs_match" || !item.matched) return "border-owl/50 bg-owl/10 text-owl";
  return "border-gain/50 bg-gain/10 text-gain";
}

async function loadSubmissions() {
  const supabase = createServiceClient();
  const submissionsRes = await supabase
    .from("psa_submissions")
    .select(
      "id, name, source_filename, submitted_at, total_rows, imported_count, matched_count, pending_match_count, skipped_duplicate_count, created_at"
    )
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (submissionsRes.error) {
    return {
      submissions: [] as PsaSubmissionRow[],
      itemsBySubmission: new Map<string, PsaSubmissionItemRow[]>(),
      error: submissionsRes.error.message,
    };
  }

  const submissions = (submissionsRes.data ?? []) as PsaSubmissionRow[];
  const submissionIds = submissions.map((submission) => submission.id);
  const itemsBySubmission = new Map<string, PsaSubmissionItemRow[]>();

  if (submissionIds.length === 0) {
    return { submissions, itemsBySubmission, error: null };
  }

  const itemsRes = await supabase
    .from("psa_submission_items")
    .select(
      "submission_id, row_number, inventory_item_id, certification_number, graded_rating, card_name, card_number, set_code, matched, skipped_duplicate, image_status, result_status"
    )
    .in("submission_id", submissionIds)
    .order("row_number", { ascending: true });

  if (itemsRes.error) {
    return { submissions, itemsBySubmission, error: itemsRes.error.message };
  }

  for (const item of (itemsRes.data ?? []) as PsaSubmissionItemRow[]) {
    itemsBySubmission.set(item.submission_id, [...(itemsBySubmission.get(item.submission_id) ?? []), item]);
  }

  return { submissions, itemsBySubmission, error: null };
}

export default async function PsaSubmissionsPage() {
  const { submissions, itemsBySubmission, error } = await loadSubmissions();

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">PSA Submissions</h1>
          <p className="mt-2 max-w-3xl text-base text-text">
            Track historical PSA imports by submission, then review every row, grade, certification, match result, and scan status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Inventory
          </Link>
          <Link
            href="/admin/inventory/import/psa"
            className="rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            PSA Import
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-owl/40 bg-owl/10 p-4 text-sm text-text">
          PSA submission tracking is not available yet. Run{" "}
          <span className="font-mono font-semibold text-owl">schema-migration-v20-psa-submissions.sql</span> in Supabase,
          then import a PSA file again.
          <div className="mt-2 font-mono text-xs text-text-2">{error}</div>
        </div>
      )}

      {!error && submissions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-text-2">
          No PSA submissions have been tracked yet.
        </div>
      )}

      <div className="grid gap-4">
        {submissions.map((submission) => {
          const items = itemsBySubmission.get(submission.id) ?? [];

          return (
            <article
              key={submission.id}
              id={`submission-${submission.id}`}
              className="rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-col gap-4 border-b border-border p-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                    {formatDate(submission.submitted_at)}
                  </div>
                  <h2 className="mt-1 text-2xl font-bold text-owl">{submission.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-text-2">
                    {submission.source_filename && <span>Source: {submission.source_filename}</span>}
                    <span>Created: {formatDate(submission.created_at)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-md border border-border bg-deep px-3 py-2 text-center">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Rows</div>
                    <div className="text-lg font-bold text-text">{submission.total_rows ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border bg-deep px-3 py-2 text-center">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Imported</div>
                    <div className="text-lg font-bold text-blue">{submission.imported_count ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border bg-deep px-3 py-2 text-center">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Matched</div>
                    <div className="text-lg font-bold text-gain">{submission.matched_count ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border bg-deep px-3 py-2 text-center">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Needs Match</div>
                    <div className="text-lg font-bold text-owl">{submission.pending_match_count ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border bg-deep px-3 py-2 text-center">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Skipped</div>
                    <div className="text-lg font-bold text-text-2">{submission.skipped_duplicate_count ?? 0}</div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="bg-surf2">
                    <tr className="font-mono text-xs font-bold uppercase tracking-wider text-text">
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Card</th>
                      <th className="px-4 py-3">Set</th>
                      <th className="px-4 py-3">Card #</th>
                      <th className="px-4 py-3">Grade</th>
                      <th className="px-4 py-3">Certification</th>
                      <th className="px-4 py-3">Images</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-2">
                          No item rows were recorded for this submission.
                        </td>
                      </tr>
                    )}
                    {items.map((item) => (
                      <tr key={`${item.submission_id}-${item.row_number}`} className="border-t border-border text-sm text-text">
                        <td className="px-4 py-3 font-mono text-text-2">{item.row_number ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded border px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider ${resultClassName(
                              item
                            )}`}
                          >
                            {resultLabel(item)}
                          </span>
                        </td>
                        <td className="max-w-[360px] px-4 py-3 font-bold text-text">{item.card_name ?? "Unknown Card"}</td>
                        <td className="px-4 py-3 font-mono text-text-2">{item.set_code ?? "-"}</td>
                        <td className="px-4 py-3 font-mono text-text-2">{item.card_number ?? "-"}</td>
                        <td className="px-4 py-3 font-mono font-bold text-owl">{item.graded_rating ?? "-"}</td>
                        <td className="px-4 py-3 font-mono text-text">{item.certification_number ?? "-"}</td>
                        <td className="px-4 py-3 text-xs text-text-2">{item.image_status ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
