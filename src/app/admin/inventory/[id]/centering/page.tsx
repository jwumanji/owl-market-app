import Link from "next/link";
import { notFound } from "next/navigation";
import CenteringWorkspace from "@/components/centering/CenteringWorkspace";
import { resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Card Centering Measurement - OWL Market",
};

const MEASUREMENTS_PAGE_SIZE = 5;

type InventoryItemRow = {
  id: string;
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  inventory_type: string;
  status: string;
  quantity: number;
  graded_rating: string | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
};

type CardRow = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
};

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
  pipeline_mode: "mock" | "opencv";
  pipeline_version: string;
  processing_ms: number | null;
  manual_adjustment: boolean | null;
};

type MeasurementPage = {
  rows: CenteringMeasurementRow[];
  count: number;
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

type CenteringSearchParams = {
  measurementPage?: string | string[];
  game?: string | string[];
};

function measurementPageFromSearchParams(searchParams?: CenteringSearchParams) {
  const raw = Array.isArray(searchParams?.measurementPage)
    ? searchParams?.measurementPage[0]
    : searchParams?.measurementPage;
  const page = Number(raw ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function gameFromSearchParams(searchParams?: CenteringSearchParams) {
  const game = Array.isArray(searchParams?.game) ? searchParams?.game[0] : searchParams?.game;
  return game?.trim() || null;
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
    return "border-gain-2/50 bg-[#DCF1E6] text-gain-2";
  }
  if (ceiling === "PSA_9" || ceiling === "PSA_8") {
    return "border-gold/50 bg-[#FCEBCF] text-gold";
  }
  return "border-loss-2/50 bg-[#FBE3E3] text-loss-2";
}

async function loadInventoryItem(id: string, measurementPage: number, gameSlug: string | null) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameSlug, { defaultToOnePiece: true });
  if (gameResult.error) {
    notFound();
  }
  const { game } = gameResult;
  const itemRes = await supabase
    .from("inventory_items")
    .select(
      "id, card_id, manual_card_name, manual_card_number, manual_set_code, item_nickname, inventory_type, status, quantity, graded_rating, certification_number, custom_image_front_url, custom_image_back_url"
    )
    .eq("id", id)
    .eq("game_id", game.id)
    .single();

  if (itemRes.error || !itemRes.data) {
    notFound();
  }

  const item = itemRes.data as InventoryItemRow;
  let card: CardRow | null = null;

  if (item.card_id) {
    const cardRes = await supabase
      .from("cards")
      .select("id, name, card_number, rarity, image_url, image_url_small, sets!cards_set_game_fk (code, name)")
      .eq("id", item.card_id)
      .eq("game_id", game.id)
      .single();

    if (!cardRes.error && cardRes.data) {
      card = cardRes.data as CardRow;
    }
  }

  const from = (measurementPage - 1) * MEASUREMENTS_PAGE_SIZE;
  const to = from + MEASUREMENTS_PAGE_SIZE - 1;
  const measurementRes = await supabase
    .from("centering_measurements")
    .select(
      "id, created_at, left_pct, right_pct, top_pct, bottom_pct, worst_axis, worst_axis_max_pct, psa_ceiling, pipeline_mode, pipeline_version, processing_ms, manual_adjustment",
      { count: "exact" }
    )
    .eq("inventory_item_id", id)
    .eq("game_id", game.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  const count = measurementRes.error ? 0 : measurementRes.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / MEASUREMENTS_PAGE_SIZE));
  const clampedPage = Math.min(measurementPage, pageCount);

  return {
    item,
    card,
    gameSlug: game.slug,
    measurements: {
      rows: (measurementRes.error ? [] : measurementRes.data ?? []) as CenteringMeasurementRow[],
      count,
      page: clampedPage,
      pageCount,
      hasPrevious: clampedPage > 1,
      hasNext: clampedPage < pageCount,
    } satisfies MeasurementPage,
  };
}

function measurementHref(itemId: string, page: number, gameSlug: string) {
  const params = new URLSearchParams({ game: gameSlug, measurementPage: String(page) });
  return `/admin/inventory/${itemId}/centering?${params}`;
}

function MeasurementHistory({
  itemId,
  measurements,
  gameSlug,
}: {
  itemId: string;
  measurements: MeasurementPage;
  gameSlug: string;
}) {
  return (
    <section className="admin-card mt-6 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">Past Measurements</div>
          <h2 className="mt-1 font-grotesk text-2xl font-bold text-ink">Centering history</h2>
        </div>
        <div className="font-mono-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
          Page {measurements.page} of {measurements.pageCount}
        </div>
      </div>

      {measurements.rows.length === 0 ? (
        <div className="mt-5 rounded-c-sm border-[1.5px] border-dashed border-ink/30 bg-bg-3 p-6 text-sm text-ink-2">
          No centering measurements yet.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-c-sm border-[1.5px] border-ink">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-bg-3 font-mono-2 text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-3 py-2 font-semibold">Measured</th>
                <th className="px-3 py-2 font-semibold">Ceiling</th>
                <th className="px-3 py-2 font-semibold">L / R</th>
                <th className="px-3 py-2 font-semibold">T / B</th>
                <th className="px-3 py-2 font-semibold">Worst axis</th>
                <th className="px-3 py-2 font-semibold">Pipeline</th>
                <th className="px-3 py-2 text-right font-semibold">Processing</th>
              </tr>
            </thead>
            <tbody>
              {measurements.rows.map((measurement) => (
                <tr key={measurement.id} className="border-t border-bg-3">
                  <td className="px-3 py-3 font-mono-2 text-xs text-ink-2">
                    {formatMeasurementDate(measurement.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-c-sm border-[1.5px] px-2.5 py-1.5 font-mono-2 text-xs font-bold uppercase tracking-wider ${ceilingClassName(
                        measurement.psa_ceiling
                      )}`}
                    >
                      {measurement.psa_ceiling}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono-2 text-ink">
                    {formatPercent(measurement.left_pct)} / {formatPercent(measurement.right_pct)}
                  </td>
                  <td className="px-3 py-3 font-mono-2 text-ink">
                    {formatPercent(measurement.top_pct)} / {formatPercent(measurement.bottom_pct)}
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {measurement.worst_axis === "leftRight" ? "Left/right" : "Top/bottom"} at{" "}
                    {formatPercent(measurement.worst_axis_max_pct)}
                    {measurement.manual_adjustment && (
                      <span className="ml-2 rounded-c-sm border-[1.5px] border-select/50 bg-select/10 px-2 py-1 font-mono-2 text-[11px] font-bold uppercase tracking-wider text-select">
                        Manual
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono-2 text-xs uppercase text-ink-2">
                    {measurement.pipeline_mode} {measurement.pipeline_version}
                  </td>
                  <td className="px-3 py-3 text-right font-mono-2 text-ink">
                    {measurement.processing_ms ?? "--"}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {measurements.hasPrevious ? (
          <Link href={measurementHref(itemId, measurements.page - 1, gameSlug)} className="admin-btn admin-btn-ghost">
            Previous measurements
          </Link>
        ) : (
          <span />
        )}
        {measurements.hasNext ? (
          <Link href={measurementHref(itemId, measurements.page + 1, gameSlug)} className="admin-btn admin-btn-ghost">
            Next measurements
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}

export default async function InventoryCenteringPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: CenteringSearchParams;
}) {
  const measurementPage = measurementPageFromSearchParams(searchParams);
  const requestedGame = gameFromSearchParams(searchParams);
  const { item, card, measurements, gameSlug } = await loadInventoryItem(params.id, measurementPage, requestedGame);
  const set = firstRelation(card?.sets);
  const cardName = card?.name ?? item.manual_card_name ?? "Unknown Card";
  const cardNumber = card?.card_number ?? item.manual_card_number;
  const setCode = set?.code ?? item.manual_set_code;
  const rarity = card?.rarity;

  return (
    <section className="admin-page admin-container">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Inventory Tool</p>
          <h1 className="admin-title">Card Centering Measurement</h1>
          <p className="admin-subline">
            Measure centering against the Owl Lens CV service and keep the latest grade ceiling tied
            to this inventory item.
          </p>
        </div>
        <Link href={`/admin/inventory?game=${encodeURIComponent(gameSlug)}`} className="admin-btn admin-btn-ghost">
          Back to Inventory
        </Link>
      </div>

      <CenteringWorkspace
        gameSlug={gameSlug}
        inventoryItemId={item.id}
        preloadImageUrl={item.custom_image_front_url}
        cardIdentity={{
          name: cardName,
          setCode,
          cardNumber,
          rarity,
        }}
      />

      <MeasurementHistory itemId={item.id} measurements={measurements} gameSlug={gameSlug} />
    </section>
  );
}
