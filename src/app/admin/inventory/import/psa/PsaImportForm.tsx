"use client";

import { useState } from "react";

type PsaImportResult = {
  count: number;
  matched: number;
  pending_match: number;
  skipped_duplicates?: number;
  submission_id?: string | null;
  submission_warning?: string | null;
  bundle_id?: string | null;
  bundle_warning?: string | null;
  rows: {
    certification_number: string | null;
    matched: boolean;
    card_name: string | null;
    card_number: string | null;
    set_code: string | null;
    graded_rating?: string | null;
    skipped_duplicate?: boolean;
    image_status?: string | null;
  }[];
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function defaultSubmissionName(file: File | null) {
  if (!file) return "";
  return file.name.replace(/\.[^.]+$/, "").trim();
}

export default function PsaImportForm() {
  const [psaFile, setPsaFile] = useState<File | null>(null);
  const [submissionName, setSubmissionName] = useState("");
  const [submittedAt, setSubmittedAt] = useState(todayDateString);
  const [createBundle, setCreateBundle] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PsaImportResult | null>(null);

  async function submit() {
    if (!psaFile || importing) return;

    const formData = new FormData();
    formData.append("psa_file", psaFile);
    formData.append("submission_name", submissionName || defaultSubmissionName(psaFile) || "PSA Submission");
    formData.append("submitted_at", submittedAt);
    if (createBundle) {
      formData.append("create_bundle", "true");
      formData.append("bundle_name", bundleName || submissionName || defaultSubmissionName(psaFile) || "PSA Bundle");
    }

    setImporting(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/admin/inventory/import/psa", {
      method: "POST",
      body: formData,
    });

    setImporting(false);

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Could not import PSA file.");
      return;
    }

    setResult(data as PsaImportResult);
  }

  return (
    <div className="admin-card p-6">
      <div>
        <h2 className="font-grotesk text-xl font-bold tracking-tight text-ink">PSA Import</h2>
        <p className="mt-1 max-w-2xl font-grotesk text-sm text-ink-2">
          Import a PSA CSV as individual Graded Card entries and save it as a tracked submission.
        </p>
      </div>

      <div className="mt-5 max-w-xl">
        <label className="block">
          <span className="admin-field-label block">PSA CSV File</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setPsaFile(nextFile);
              if (!submissionName) setSubmissionName(defaultSubmissionName(nextFile));
              if (!bundleName) setBundleName(defaultSubmissionName(nextFile));
            }}
            className="admin-input mt-2 w-full !h-auto !py-2.5 file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase file:tracking-wider file:text-bg hover:file:bg-[#2E1C10]"
          />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="admin-field-label block">Submission Name</span>
            <input
              value={submissionName}
              onChange={(event) => setSubmissionName(event.target.value)}
              placeholder="PSA submission name"
              className="admin-input mt-2 w-full"
            />
          </label>
          <label className="block">
            <span className="admin-field-label block">Submission Date</span>
            <input
              type="date"
              value={submittedAt}
              onChange={(event) => setSubmittedAt(event.target.value)}
              className="admin-input mt-2 w-full"
            />
          </label>
        </div>
        <div className="admin-card-inset mt-4 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={createBundle}
              onChange={(event) => setCreateBundle(event.target.checked)}
              className="mt-1 h-4 w-4 accent-coral"
            />
            <span>
              <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
                Create Inventory Bundle From This Upload
              </span>
              <span className="mt-1 block font-grotesk text-sm text-ink-2">
                Use this for sequential PSA submissions or groups of graded cards that should stay together.
              </span>
            </span>
          </label>
          {createBundle && (
            <label className="mt-3 block">
              <span className="admin-field-label block">Bundle Name</span>
              <input
                value={bundleName}
                onChange={(event) => setBundleName(event.target.value)}
                placeholder="Sequential PSA bundle name"
                className="admin-input mt-2 w-full"
              />
            </label>
          )}
        </div>
        <div className="mt-5">
          <button
            type="button"
            disabled={!psaFile || importing}
            onClick={submit}
            className="admin-btn admin-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? "Importing..." : "Import and Track Submission"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm font-semibold text-ink">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-c-md border-[1.5px] border-gain-2 bg-[#DCF1E6] p-4">
          <div className="grid gap-3 font-mono text-sm font-semibold text-ink md:grid-cols-4">
            <div>Imported {result.count}</div>
            <div>Matched {result.matched}</div>
            <div>Skipped {result.skipped_duplicates ?? 0}</div>
            <div className="flex items-center justify-between gap-3">
              <span>Needs Match {result.pending_match}</span>
              {result.pending_match > 0 && (
                <a
                  href="/admin/inventory?review=needs-match"
                  className="rounded border-[1.5px] border-coral bg-bg-2 px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-coral transition-colors hover:bg-[#FFE2DD]"
                >
                  Review
                </a>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.submission_id && (
              <a
                href={`/admin/psa-submissions#submission-${result.submission_id}`}
                className="rounded border-[1.5px] border-select bg-bg-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-select transition-colors hover:bg-[#F2F5FB]"
              >
                View Submission
              </a>
            )}
            {result.submission_warning && (
              <span className="rounded border-[1.5px] border-gold bg-[#FBF0DA] px-3 py-2 font-grotesk text-xs font-semibold text-ink">
                Submission tracking skipped: {result.submission_warning}
              </span>
            )}
            {result.bundle_id && (
              <a
                href={`/admin/bundles/${result.bundle_id}`}
                className="rounded border-[1.5px] border-ink bg-bg-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-bg-3"
              >
                View Bundle
              </a>
            )}
            {result.bundle_warning && (
              <span className="rounded border-[1.5px] border-gold bg-[#FBF0DA] px-3 py-2 font-grotesk text-xs font-semibold text-ink">
                Bundle skipped: {result.bundle_warning}
              </span>
            )}
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto rounded border-[1.5px] border-ink bg-bg-2">
            {result.rows.map((row, index) => (
              <div
                key={`${row.certification_number ?? "row"}-${index}`}
                className="flex flex-wrap items-center gap-2 border-b border-b-bg-3 px-3 py-2 font-mono text-xs text-ink-2 last:border-b-0"
              >
                <span
                  className={
                    row.skipped_duplicate
                      ? "font-semibold text-select"
                      : row.matched
                        ? "font-semibold text-gain-2"
                        : "font-semibold text-coral"
                  }
                >
                  {row.skipped_duplicate && row.image_status?.includes("Already in inventory")
                    ? "Already in Inventory"
                    : row.skipped_duplicate
                      ? "Skipped"
                      : row.matched
                        ? "Matched"
                        : "Needs Match"}
                </span>
                {row.set_code && <span>{row.set_code}</span>}
                {row.card_number && <span>{row.card_number}</span>}
                {row.graded_rating && <span>{row.graded_rating}</span>}
                <span className="min-w-0 flex-1 truncate font-grotesk text-ink">{row.card_name ?? "Unknown Card"}</span>
                {row.certification_number && <span>Cert {row.certification_number}</span>}
                {row.image_status && (
                  <span className={row.image_status.includes("imported") ? "font-semibold text-gain-2" : "font-semibold text-ink-2"}>
                    {row.image_status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
