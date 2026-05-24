import type { SupabaseClient } from "@supabase/supabase-js";
import {
  gameParamFromRequest,
  resolveGameScope,
  type GameScope,
} from "@/lib/game-scope";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";

export type ResolveOnePieceSyncGameResult =
  | { game: GameScope; error: null }
  | { game: null; error: { message: string; status: number } };

export async function resolveOnePieceSyncGame(
  supabase: SupabaseClient,
  request: Request
): Promise<ResolveOnePieceSyncGameResult> {
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));

  if (gameResult.error) return gameResult;

  if (gameResult.game.slug !== ONE_PIECE_DB_SLUG) {
    return {
      game: null,
      error: {
        message: `Sync adapter is not configured for game "${gameResult.game.slug}".`,
        status: 400,
      },
    };
  }

  return { game: gameResult.game, error: null };
}
