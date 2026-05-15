"use client";

import { useMemo, useState } from "react";

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
  if (item.result_status === "already_in_inventory") return "border-blue/50 bg-blue/10 text-blue";
  if (item.skipped_duplicate) return "border-border bg-surf2 text-text-2";
  if (item.result_status === "needs_match" || !item.matched) return "border-owl/50 bg-owl/10 text-owl";
  return "border-gain/50 bg-gain/10 text-gain";
}

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
      <span className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-2">
        No Grades
      </span>
    );
  }

  return counts.map((grade) => (
    <span
      key={grade.label}
      className="rounded-md border border-owl/40 bg-owl/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-owl"
    >
      {grade.label} <span className="text-text">{grade.count}</span>
    </span>
  ));
}

export default function PsaSubmissionsClient({ initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSubmission = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions]
  );
  const sortedSubmissions = useMemo(() => [...submissions].sort(compareSubmissions), [submissions]);
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
    const res = await fetch(`/api/admin/psa-submissions/${submission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
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
        <div className="mb-4 rounded-md border border-loss/30 bg-loss/10 p-3 text-sm font-semibold text-text">
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
              className="rounded-lg border border-border bg-surface p-5"
            >
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                    {formatDate(submission.submitted_at)}
                  </div>
                  {isEditing ? (
                    <div className="mt-2 flex max-w-2xl flex-col gap-2 sm:flex-row">
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-owl bg-deep px-3 py-2.5 text-lg font-bold text-text outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(submission)}
                        disabled={!draftName.trim() || savingId === submission.id}
                        className="rounded-md bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void disabled:cursor-not-allowed disabled:bg-surf3 disabled:text-text-3"
                      >
                        {savingId === submission.id ? "Saving" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text hover:border-border-2 hover:text-owl"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-2xl font-bold text-owl">{submission.name}</h2>
                      <button
                        type="button"
                        onClick={() => beginRename(submission)}
                        className="rounded-md border border-border bg-deep p-2 text-text-2 transition-colors hover:border-border-2 hover:text-owl"
                        aria-label={`Rename ${submission.name}`}
                      >
                        <EditIcon />
                      </button>
                    </div>
                  )}
                  {orderNumber && (
                    <div className="mt-1 font-mono text-sm font-extrabold uppercase tracking-wider text-blue">
                      ORDER # <span className="text-owl">{orderNumber}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-text-2">
                    {submission.source_filename && <span>Source: {submission.source_filename}</span>}
                    <span>Created: {formatDate(submission.created_at)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-md border border-blue/40 bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue">
                      Cards <span className="text-text">{submission.total_rows ?? submission.items.length}</span>
                    </span>
                    <GradePills counts={grades} />
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="flex h-16 items-center justify-start xl:justify-end">
                    {thumbnails.length > 0 ? (
                      <div className="flex -space-x-2">
                        {thumbnails.map((item) => (
                          <div
                            key={`${submission.id}-${item.row_number}-${item.certification_number}`}
                            className="h-16 w-12 overflow-hidden rounded-md border border-border-2 bg-deep"
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
                      <div className="rounded-md border border-dashed border-border px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-2">
                        No Images
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(submission.id)}
                    className="rounded-md border border-owl bg-owl/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[90vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-lg border border-border-2 bg-surface shadow-2xl shadow-black/50">
            <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
                  {formatDate(selectedSubmission.submitted_at)}
                </div>
                <h2 className="mt-1 text-2xl font-bold text-owl">{selectedSubmission.name}</h2>
                {selectedOrderNumber && (
                  <div className="mt-1 font-mono text-sm font-extrabold uppercase tracking-wider text-blue">
                    ORDER # <span className="text-owl">{selectedOrderNumber}</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <GradePills counts={gradeCounts(selectedSubmission.items)} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md border border-border bg-surf2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text hover:border-border-2 hover:text-owl"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead className="sticky top-0 bg-surf2">
                  <tr className="font-mono text-xs font-bold uppercase tracking-wider text-text">
                    <th className="px-4 py-3">Image</th>
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
                  {selectedSubmission.items.map((item) => (
                    <tr
                      key={`${selectedSubmission.id}-${item.row_number}-${item.certification_number}`}
                      className="border-t border-border text-sm text-text"
                    >
                      <td className="px-4 py-3">
                        {item.thumbnail_url ? (
                          <div className="h-20 w-14 overflow-hidden rounded-md border border-border bg-deep">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.thumbnail_url}
                              alt={item.card_name ?? "PSA card thumbnail"}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-20 w-14 items-center justify-center rounded-md border border-dashed border-border bg-deep font-mono text-[10px] uppercase text-text-2">
                            No Img
                          </div>
                        )}
                      </td>
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
          </div>
        </div>
      )}
    </>
  );
}
