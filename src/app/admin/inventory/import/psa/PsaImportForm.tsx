"use client";

import { useState } from "react";

type PsaImportResult = {
  count: number;
  matched: number;
  pending_match: number;
  skipped_duplicates?: number;
  rows: {
    certification_number: string | null;
    matched: boolean;
    card_name: string | null;
    card_number: string | null;
    set_code: string | null;
    skipped_duplicate?: boolean;
    image_status?: string | null;
  }[];
};

export default function PsaImportForm() {
  const [psaFile, setPsaFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PsaImportResult | null>(null);

  async function submit() {
    if (!psaFile || importing) return;

    const formData = new FormData();
    formData.append("psa_file", psaFile);

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
    <div className="rounded-lg border border-border bg-surface p-5">
      <div>
        <div>
          <h2 className="text-xl font-bold text-text">PSA Import</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-2">
            Import a PSA CSV as individual Graded Card entries.
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-xl">
        <label className="block">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">PSA CSV File</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => setPsaFile(event.target.files?.[0] ?? null)}
            className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-2.5 text-sm text-text file:mr-3 file:rounded file:border-0 file:bg-owl file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase file:text-void"
          />
        </label>
        <div className="mt-4">
          <button
            type="button"
            disabled={!psaFile || importing}
            onClick={submit}
            className="rounded-md bg-owl px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:bg-surf3 disabled:text-text-3"
          >
            {importing ? "Importing..." : "Import to Graded Card"}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-loss/30 bg-loss/10 p-3 text-sm text-text">{error}</div>}

      {result && (
        <div className="mt-4 rounded-md border border-gain/30 bg-[rgba(0,214,143,0.08)] p-4">
          <div className="grid gap-3 font-mono text-sm font-semibold text-text md:grid-cols-4">
            <div>Imported {result.count}</div>
            <div>Matched {result.matched}</div>
            <div>Skipped {result.skipped_duplicates ?? 0}</div>
            <div className="flex items-center justify-between gap-3">
              <span>Needs Match {result.pending_match}</span>
              {result.pending_match > 0 && (
                <a
                  href="/admin/inventory?review=needs-match"
                  className="rounded border border-owl/60 bg-owl/10 px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15"
                >
                  Review
                </a>
              )}
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-border bg-deep">
            {result.rows.map((row, index) => (
              <div key={`${row.certification_number ?? "row"}-${index}`} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs text-text-2 last:border-b-0">
                <span className={row.skipped_duplicate ? "font-semibold text-text-2" : row.matched ? "font-semibold text-gain" : "font-semibold text-owl"}>
                  {row.skipped_duplicate ? "Skipped" : row.matched ? "Matched" : "Needs Match"}
                </span>
                {row.set_code && <span>{row.set_code}</span>}
                {row.card_number && <span>{row.card_number}</span>}
                <span className="min-w-0 flex-1 truncate text-text">{row.card_name ?? "Unknown Card"}</span>
                {row.certification_number && <span>Cert {row.certification_number}</span>}
                {row.image_status && (
                  <span className={row.image_status.includes("imported") ? "font-semibold text-gain" : "font-semibold text-text-2"}>
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
