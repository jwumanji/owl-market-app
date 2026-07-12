import { NextResponse } from "next/server";
import { synchronizeCharacterIndex } from "@/lib/character-index-sync";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

// GET|POST /api/sync/characters
// Creates missing profiles, merges canonical identities, rebuilds primary and
// multi-character relationships, and refreshes the public index summaries.
async function syncCharacters(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }

  try {
    const result = await synchronizeCharacterIndex(supabase, gameResult.game);
    return NextResponse.json({
      message: "Character index synchronized",
      game: gameResponsePayload(gameResult.game),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Character synchronization failed." },
      { status: 500 }
    );
  }
}

export { syncCharacters as GET, syncCharacters as POST };
