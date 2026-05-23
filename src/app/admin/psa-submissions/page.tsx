import Link from "next/link";
import PsaSubmissionsClient, { type PsaSubmissionView } from "./PsaSubmissionsClient";
import { resolveGameScope } from "@/lib/game-scope";
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

type PsaSubmissionsSearchParams = {
  game?: string | string[];
};

function getInitialGame(searchParams?: PsaSubmissionsSearchParams) {
  const game = Array.isArray(searchParams?.game) ? searchParams?.game[0] : searchParams?.game;
  return game?.trim() || null;
}

async function loadSubmissions(requestedGame?: string | null) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, requestedGame, { defaultToOnePiece: true });
  if (gameResult.error) {
    return { submissions: [] as PsaSubmissionView[], error: gameResult.error.message, gameSlug: null as string | null };
  }
  const { game } = gameResult;
  const submissionsRes = await supabase
    .from("psa_submissions")
    .select(
      "id, name, source_filename, submitted_at, total_rows, imported_count, matched_count, pending_match_count, skipped_duplicate_count, created_at"
    )
    .eq("game_id", game.id)
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (submissionsRes.error) {
    return { submissions: [] as PsaSubmissionView[], error: submissionsRes.error.message, gameSlug: game.slug };
  }

  const submissions = (submissionsRes.data ?? []) as PsaSubmissionRow[];
  const submissionIds = submissions.map((submission) => submission.id);
  if (submissionIds.length === 0) {
    return { submissions: [] as PsaSubmissionView[], error: null, gameSlug: game.slug };
  }

  const itemsRes = await supabase
    .from("psa_submission_items")
    .select(
      "submission_id, row_number, inventory_item_id, certification_number, graded_rating, card_name, card_number, set_code, matched, skipped_duplicate, image_status, result_status"
    )
    .eq("game_id", game.id)
    .in("submission_id", submissionIds)
    .order("row_number", { ascending: true });

  if (itemsRes.error) {
    return { submissions: [] as PsaSubmissionView[], error: itemsRes.error.message, gameSlug: game.slug };
  }

  const itemRows = (itemsRes.data ?? []) as PsaSubmissionItemRow[];
  const inventoryIds = Array.from(new Set(itemRows.map((item) => item.inventory_item_id).filter(Boolean))) as string[];
  const inventoryMap = new Map<string, InventoryImageRow>();
  const cardMap = new Map<string, CardImageRow>();

  if (inventoryIds.length > 0) {
    const inventoryRes = await supabase
      .from("inventory_items")
      .select("id, card_id, custom_image_front_url, custom_image_back_url")
      .in("id", inventoryIds)
      .eq("game_id", game.id);

    if (inventoryRes.error) {
      return { submissions: [] as PsaSubmissionView[], error: inventoryRes.error.message, gameSlug: game.slug };
    }

    const inventoryRows = (inventoryRes.data ?? []) as InventoryImageRow[];
    inventoryRows.forEach((row) => inventoryMap.set(row.id, row));
    const cardIds = Array.from(new Set(inventoryRows.map((row) => row.card_id).filter(Boolean))) as string[];

    if (cardIds.length > 0) {
      const cardsRes = await supabase
        .from("cards")
        .select("id, image_url, image_url_small")
        .in("id", cardIds)
        .eq("game_id", game.id);

      if (cardsRes.error) {
        return { submissions: [] as PsaSubmissionView[], error: cardsRes.error.message, gameSlug: game.slug };
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
    gameSlug: game.slug,
  };
}

export default async function PsaSubmissionsPage({
  searchParams,
}: {
  searchParams?: PsaSubmissionsSearchParams | Promise<PsaSubmissionsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedGame = getInitialGame(resolvedSearchParams);
  const { submissions, error, gameSlug } = await loadSubmissions(requestedGame);
  const encodedGameSlug = encodeURIComponent(gameSlug ?? requestedGame ?? "one_piece");

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">PSA Submissions</h1>
          <p className="admin-subline">
            Review submissions by date, card count, grade results, and open the itemized card list only when needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/inventory?game=${encodedGameSlug}`} className="admin-btn admin-btn-ghost">
            Back to Inventory
          </Link>
          <Link href={`/admin/inventory/import/psa?game=${encodedGameSlug}`} className="admin-btn admin-btn-primary">
            PSA Import
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          PSA submission tracking is not available yet. Run{" "}
          <span className="font-mono font-semibold text-coral">schema-migration-v20-psa-submissions.sql</span> in Supabase,
          then import a PSA file again.
          <div className="mt-2 font-mono text-xs text-ink-2">{error}</div>
        </div>
      )}

      {!error && submissions.length === 0 && (
        <div className="rounded-c-md border-[1.5px] border-dashed border-ink-3 bg-bg-2 p-10 text-center font-grotesk text-sm text-ink-2">
          No PSA submissions have been tracked yet.
        </div>
      )}

      {!error && submissions.length > 0 && <PsaSubmissionsClient initialSubmissions={submissions} gameSlug={gameSlug ?? undefined} />}
    </section>
  );
}
