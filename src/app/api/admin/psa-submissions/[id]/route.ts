import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  gameParamFromBody,
  gameParamFromRequest,
  resolveGameScope,
} from "@/lib/game-scope";

type RequestBody = Record<string, unknown>;

function stringValue(body: RequestBody, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = stringValue(body as RequestBody, "name");
  if (!name) {
    return NextResponse.json({ error: "Submission name is required" }, { status: 400 });
  }

  if (name.length > 140) {
    return NextResponse.json({ error: "Submission name must be 140 characters or fewer" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(
    supabase,
    gameParamFromBody(body as RequestBody) ?? gameParamFromRequest(request)
  );

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const { data, error } = await supabase
    .from("psa_submissions")
    .update({ name })
    .eq("game_id", game.id)
    .eq("id", params.id)
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
