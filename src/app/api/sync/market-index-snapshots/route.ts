import { NextResponse } from "next/server";
import { gameParamFromRequest, gameResponsePayload, resolveGameScope } from "@/lib/game-scope";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function snapshotDateFromRequest(request: Request) {
  const value = new URL(request.url).searchParams.get("date");
  if (value == null) return null;
  if (!ISO_DATE.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

async function captureMarketIndexSnapshots(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const snapshotDate = snapshotDateFromRequest(request);
  if (snapshotDate === undefined) {
    return NextResponse.json(
      { error: "date must be a valid calendar date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));
  if (gameResult.error) {
    return NextResponse.json(
      { error: gameResult.error.message },
      { status: gameResult.error.status }
    );
  }

  const { data, error } = await supabase.rpc("capture_market_index_snapshots", {
    p_game_id: gameResult.game.id,
    p_snapshot_date: snapshotDate,
  });

  if (error) {
    return NextResponse.json(
      { error: `Market index snapshot capture failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    captured: true,
    game: gameResponsePayload(gameResult.game),
    snapshot: data,
  });
}

export { captureMarketIndexSnapshots as GET, captureMarketIndexSnapshots as POST };
