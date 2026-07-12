import { NextResponse } from "next/server";
import { gameParamFromRequest, gameResponsePayload, resolveGameScope } from "@/lib/game-scope";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { refreshPublicGameSummaries } from "@/lib/public-page-summaries";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

async function refreshSummaries(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }

  await refreshPublicGameSummaries(supabase, gameResult.game.id);
  return NextResponse.json({
    refreshed: true,
    game: gameResponsePayload(gameResult.game),
    refreshedAt: new Date().toISOString(),
  });
}

export { refreshSummaries as GET, refreshSummaries as POST };
