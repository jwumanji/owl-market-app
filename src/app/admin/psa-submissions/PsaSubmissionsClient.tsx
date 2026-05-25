"use client";

import { useMemo, useState } from "react";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";

export type PsaSubmissionItemView = {
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
  thumbnail_url: string | null;
};

export type PsaSubmissionView = {
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
  items: PsaSubmissionItemView[];
};

type Props = {
  initialSubmissions: PsaSubmissionView[];
  gameSlug?: string;
};

type GradeCount = {
  label: string;
  count: number;
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

function normalizeGrade(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim().toUpperCase() || "Ungraded";
}

function orderNumberFromFilename(value?: string | null) {
  if (!value) return null;
  return value.match(/psa[-_\s]?order[-_\s]?(\d+)/i)?.[1] ?? value.match(/(\d{5,})/)?.[1] ?? null;
}

function orderNumberSortValue(value?: string | null) {
  const orderNumber = orderNumberFromFilename(value);
  if (!orderNumber) return null;
  const parsed = Number(orderNumber);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateSortValue(value?: string | null) {
  if (!value) return 0;
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareSubmissions(a: PsaSubmissionView, b: PsaSubmissionView) {
  const aOrder = orderNumberSortValue(a.source_filename);
  const bOrder = orderNumberSortValue(b.source_filename);
  if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return bOrder - aOrder;
  if (aOrder !== null && bOrder === null) return -1;
  if (aOrder === null && bOrder !== null) return 1;

  const aDate = dateSortValue(a.submitted_at ?? a.created_at);
  const bDate = dateSortValue(b.submitted_at ?? b.created_at);
  return bDate - aDate;
}

function shouldUseSubmission(candidate: PsaSubmissionView, current: PsaSubmissionView) {
  const candidateValues = [
    candidate.items.filter((item) => item.thumbnail_url).length,
    candidate.items.filter((item) => item.inventory_item_id).length,
    candidate.imported_count ?? 0,
    candidate.matched_count ?? 0,
    dateSortValue(candidate.created_at ?? candidate.submitted_at),
  ];
  const currentValues = [
    current.items.filter((item) => item.thumbnail_url).length,
    current.items.filter((item) => item.inventory_item_id).length,
    current.imported_count ?? 0,
    current.matched_count ?? 0,
    dateSortValue(current.created_at ?? current.submitted_at),
  ];

  for (let index = 0; index < candidateValues.length; index += 1) {
    const candidateValue = candidateValues[index] ?? 0;
    const currentValue = currentValues[index] ?? 0;
    if (candidateValue !== currentValue) return candidateValue > currentValue;
  }

  return false;
}

function dedupeSubmissionsByOrderNumber(submissions: PsaSubmissionView[]) {
  const byOrderNumber = new Map<string, PsaSubmissionView>();
  const withoutOrderNumber: PsaSubmissionView[] = [];

  submissions.forEach((submission) => {
    const orderNumber = orderNumberFromFilename(submission.source_filename);
    if (!orderNumber) {
      withoutOrderNumber.push(submission);
      return;
    }

    const current = byOrderNumber.get(orderNumber);
    if (!current || shouldUseSubmission(submission, current)) {
      byOrderNumber.set(orderNumber, submission);
    }
  });

  return [...Array.from(byOrderNumber.values()), ...withoutOrderNumber];
}

function gradeSortValue(label: string) {
  const number = Number(label.match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : -1;
}

function gradeCounts(items: PsaSubmissionItemView[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const grade = normalizeGrade(item.graded_rating);
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => gradeSortValue(b.label) - gradeSortValue(a.label) || a.label.localeCompare(b.label));
}

function resultLabel(item: PsaSubmissionItemView) {
  if (item.result_status === "already_in_inventory") return "Already in Inventory";
  if (item.skipped_duplicate) return "Skipped";
  if (item.result_status === "needs_match" || !item.matched) return "Needs Match";
  return "Matched";
}

function resultClassName(item: PsaSubmissionItemView) {
  if (item.result_status === "already_in_inventory") return "border-select bg-[#F2F5FB] text-select";
  if (item.skipped_duplicate) return "border-ink-3 bg-bg-2 text-ink-3";
  if (item.result_status === "needs_match" || !item.matched) return "border-coral bg-[#FFE2DD] text-coral";
  return "border-gain-2 bg-[#DCF1E6] text-gain-2";
}

function gradeBucket(label: string): "g10" | "g9" | "g8" | "g7" | "glow" {
  const number = Number(label.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(number)) return "glow";
  if (number >= 10) return "g10";
  if (number >= 9) return "g9";
  if (number >= 8) return "g8";
  if (number >= 7) return "g7";
  return "glow";
}

const GRADE_PILL_CLASS: Record<"g10" | "g9" | "g8" | "g7" | "glow", string> = {
  g10: "border-grade-10 bg-[#DCF1E6] text-grade-10",
  g9: "border-grade-9 bg-[#ECF2D9] text-grade-9",
  g8: "border-grade-8 bg-[#FBF0DA] text-grade-8b",
  g7: "border-grade-7 bg-[#FBE6D6] text-grade-7",
  glow: "border-grade-low bg-[#FBE3E3] text-grade-low",
};

function sampleThumbnails(items: PsaSubmissionItemView[]) {
  return items.filter((item) => item.thumbnail_url).slice(0, 5);
}

function EditIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function GradePills({ counts }: { counts: GradeCount[] }) {
  if (counts.length === 0) {
    return (
      <span className="inline-flex items-center rounded-c-sm border-[1.5px] border-ink-3 bg-bg-2 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
        No Grades
      </span>
    );
  }

  return counts.map((grade) => {
    const bucket = gradeBucket(grade.label);
    return (
      <span
        key={grade.label}
        className={`inline-flex items-center gap-2 rounded-c-pill border-[1.5px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.05em] ${GRADE_PILL_CLASS[bucket]}`}
      >
        {grade.label}
        <span className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-c-pill bg-ink px-1.5 font-mono text-[10.5px] font-extrabold leading-none text-bg">
          {grade.count}
        </span>
      </span>
    );
  });
}

export default function PsaSubmissionsClient({
  initialSubmissions,
  gameSlug = DEFAULT_PUBLIC_GAME_DB_SLUG,
}: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedSubmissions = useMemo(
    () => dedupeSubmissionsByOrderNumber(submissions).sort(compareSubmissions),
    [submissions]
  );
  const selectedSubmission = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions]
  );
  const selectedOrderNumber = orderNumberFromFilename(selectedSubmission?.source_filename);

  function beginRename(submission: PsaSubmissionView) {
    setEditingId(submission.id);
    setDraftName(submission.name);
    setError(null);
  }

  async function saveRename(submission: PsaSubmissionView) {
    const nextName = draftName.trim();
    if (!nextName || savingId) return;

    setSavingId(submission.id);
    setError(null);
    const res = await fetch(`/api/admin/psa-submissions/${submission.id}?game=${encodeURIComponent(gameSlug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName, game: gameSlug }),
    });
    const payload = await res.json().catch(() => null);
    setSavingId(null);

    if (!res.ok) {
      setError(payload?.error ?? "Could not rename PSA submission.");
      return;
    }

    setSubmissions((current) =>
      current.map((item) => (item.id === submission.id ? { ...item, name: payload.name ?? nextName } : item))
    );
    setEditingId(null);
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm font-semibold text-ink">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {sortedSubmissions.map((submission) => {
          const grades = gradeCounts(submission.items);
          const thumbnails = sampleThumbnails(submission.items);
          const isEditing = editingId === submission.id;
          const orderNumber = orderNumberFromFilename(submission.source_filename);

          return (
            <article
              key={submission.id}
              id={`submission-${submission.id}`}
              className="admin-card p-6"
            >
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                    {formatDate(submission.submitted_at)}
                  </div>
                  {isEditing ? (
                    <div className="mt-2 flex max-w-2xl flex-col gap-2 sm:flex-row">
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="admin-input min-w-0 flex-1 !h-auto !py-2.5 text-lg font-bold"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(submission)}
                        disabled={!draftName.trim() || savingId === submission.id}
                        className="admin-btn admin-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === submission.id ? "Saving" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="admin-btn admin-btn-ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <h2 className="truncate font-grotesk text-2xl font-bold tracking-tight text-ink">
                        {submission.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => beginRename(submission)}
                        className="flex h-8 w-8 items-center justify-center rounded-c-sm border-[1.5px] border-ink-3 bg-bg-2 text-ink-2 transition-colors hover:border-ink hover:text-ink"
                        aria-label={`Rename ${submission.name}`}
                      >
                        <EditIcon />
                      </button>
                    </div>
                  )}
                  {orderNumber && (
                    <div className="mt-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink-2">
                      Order # <span className="text-coral">{orderNumber}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3.5 font-mono text-[11px] font-medium text-ink-2">
                    {submission.source_filename && <span>Source: {submission.source_filename}</span>}
                    <span>Created: {formatDate(submission.created_at)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-c-sm border-[1.5px] border-ink bg-bg-3 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-ink-2">
                      Cards <span className="text-ink">{submission.total_rows ?? submission.items.length}</span>
                    </span>
                    <GradePills counts={grades} />
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3.5 xl:items-end">
                  <div className="flex h-[70px] items-center justify-start xl:justify-end">
                    {thumbnails.length > 0 ? (
                      <div className="flex">
                        {thumbnails.map((item, index) => (
                          <div
                            key={`${submission.id}-${item.row_number}-${item.certification_number}`}
                            className="h-[70px] w-[50px] overflow-hidden rounded-md border-[1.5px] border-ink bg-bg-2 shadow-[0_0_0_2.5px_var(--bg-2)]"
                            style={{ marginLeft: index === 0 ? 0 : -12 }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.thumbnail_url ?? ""}
                              alt={item.card_name ?? "PSA card thumbnail"}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-c-sm border-[1.5px] border-dashed border-ink-3 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                        No Images
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(submission.id)}
                    className="admin-btn admin-btn-ghost"
                  >
                    View Items
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-c-md border-[1.5px] border-ink bg-bg-2 shadow-[0_24px_64px_rgba(26,15,8,0.32)]">
            <div className="flex flex-col gap-3 border-b-[1.5px] border-ink bg-bg-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                  {formatDate(selectedSubmission.submitted_at)}
                </div>
                <h2 className="mt-1 font-grotesk text-xl font-bold tracking-tight text-ink">
                  {selectedSubmission.name}
                </h2>
                {selectedOrderNumber && (
                  <div className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink-2">
                    Order # <span className="text-coral">{selectedOrderNumber}</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <GradePills counts={gradeCounts(selectedSubmission.items)} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="admin-btn admin-btn-ghost"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead className="sticky top-0 bg-bg-3">
                  <tr className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-2">
                    <th className="px-4 py-3 font-semibold">Image</th>
                    <th className="px-4 py-3 font-semibold">Row</th>
                    <th className="px-4 py-3 font-semibold">Result</th>
                    <th className="px-4 py-3 font-semibold">Card</th>
                    <th className="px-4 py-3 font-semibold">Set</th>
                    <th className="px-4 py-3 font-semibold">Card #</th>
                    <th className="px-4 py-3 font-semibold">Grade</th>
                    <th className="px-4 py-3 font-semibold">Certification</th>
                    <th className="px-4 py-3 font-semibold">Images</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubmission.items.map((item) => (
                    <tr
                      key={`${selectedSubmission.id}-${item.row_number}-${item.certification_number}`}
                      className="border-t border-t-bg-3 text-sm text-ink"
                    >
                      <td className="px-4 py-3">
                        {item.thumbnail_url ? (
                          <div className="h-20 w-14 overflow-hidden rounded-md border-[1.5px] border-ink bg-bg-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.thumbnail_url}
                              alt={item.card_name ?? "PSA card thumbnail"}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-20 w-14 items-center justify-center rounded-md border-[1.5px] border-dashed border-ink-3 bg-bg-2 font-mono text-[10px] uppercase text-ink-3">
                            No Img
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-2">{item.row_number ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-c-pill border-[1.5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] ${resultClassName(
                            item
                          )}`}
                        >
                          {resultLabel(item)}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-4 py-3 font-grotesk text-[13px] font-bold text-ink">
                        {item.card_name ?? "Unknown Card"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-2">{item.set_code ?? "-"}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-2">{item.card_number ?? "-"}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink">{item.graded_rating ?? "-"}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">{item.certification_number ?? "-"}</td>
                      <td className="px-4 py-3 font-mono text-[11px] font-medium text-ink-2">{item.image_status ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
