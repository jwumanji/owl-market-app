import Link from "next/link";
import PsaSubmissionsClient, { type PsaSubmissionView } from "./PsaSubmissionsClient";
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

type InventoryImageRow = {
  id: string;
  card_id: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
};

type CardImageRow = {
  id: string;
  image_url: string | null;
  image_url_small: string | null;
};

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
    return { submissions: [] as PsaSubmissionView[], error: submissionsRes.error.message };
  }

  const submissions = (submissionsRes.data ?? []) as PsaSubmissionRow[];
  const submissionIds = submissions.map((submission) => submission.id);
  if (submissionIds.length === 0) {
    return { submissions: [] as PsaSubmissionView[], error: null };
  }

  const itemsRes = await supabase
    .from("psa_submission_items")
    .select(
      "submission_id, row_number, inventory_item_id, certification_number, graded_rating, card_name, card_number, set_code, matched, skipped_duplicate, image_status, result_status"
    )
    .in("submission_id", submissionIds)
    .order("row_number", { ascending: true });

  if (itemsRes.error) {
    return { submissions: [] as PsaSubmissionView[], error: itemsRes.error.message };
  }

  const itemRows = (itemsRes.data ?? []) as PsaSubmissionItemRow[];
  const inventoryIds = Array.from(new Set(itemRows.map((item) => item.inventory_item_id).filter(Boolean))) as string[];
  const inventoryMap = new Map<string, InventoryImageRow>();
  const cardMap = new Map<string, CardImageRow>();

  if (inventoryIds.length > 0) {
    const inventoryRes = await supabase
      .from("inventory_items")
      .select("id, card_id, custom_image_front_url, custom_image_back_url")
      .in("id", inventoryIds);

    if (inventoryRes.error) {
      return { submissions: [] as PsaSubmissionView[], error: inventoryRes.error.message };
    }

    const inventoryRows = (inventoryRes.data ?? []) as InventoryImageRow[];
    inventoryRows.forEach((row) => inventoryMap.set(row.id, row));
    const cardIds = Array.from(new Set(inventoryRows.map((row) => row.card_id).filter(Boolean))) as string[];

    if (cardIds.length > 0) {
      const cardsRes = await supabase
        .from("cards")
        .select("id, image_url, image_url_small")
        .in("id", cardIds);

      if (cardsRes.error) {
        return { submissions: [] as PsaSubmissionView[], error: cardsRes.error.message };
      }

      ((cardsRes.data ?? []) as CardImageRow[]).forEach((row) => cardMap.set(row.id, row));
    }
  }

  const itemsBySubmission = new Map<string, PsaSubmissionView["items"]>();
  for (const item of itemRows) {
    const inventoryItem = item.inventory_item_id ? inventoryMap.get(item.inventory_item_id) ?? null : null;
    const cardImage = inventoryItem?.card_id ? cardMap.get(inventoryItem.card_id) ?? null : null;
    const thumbnailUrl =
      inventoryItem?.custom_image_front_url ?? cardImage?.image_url_small ?? cardImage?.image_url ?? null;

    itemsBySubmission.set(item.submission_id, [
      ...(itemsBySubmission.get(item.submission_id) ?? []),
      {
        row_number: item.row_number,
        inventory_item_id: item.inventory_item_id,
        certification_number: item.certification_number,
        graded_rating: item.graded_rating,
        card_name: item.card_name,
        card_number: item.card_number,
        set_code: item.set_code,
        matched: item.matched,
        skipped_duplicate: item.skipped_duplicate,
        image_status: item.image_status,
        result_status: item.result_status,
        thumbnail_url: thumbnailUrl,
      },
    ]);
  }

  return {
    submissions: submissions.map((submission) => ({
      ...submission,
      items: itemsBySubmission.get(submission.id) ?? [],
    })),
    error: null,
  };
}

export default async function PsaSubmissionsPage() {
  const { submissions, error } = await loadSubmissions();

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">PSA Submissions</h1>
          <p className="mt-2 max-w-3xl text-base text-text">
            Review submissions by date, card count, grade results, and open the itemized card list only when needed.
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

      {!error && submissions.length > 0 && <PsaSubmissionsClient initialSubmissions={submissions} />}
    </section>
  );
}
