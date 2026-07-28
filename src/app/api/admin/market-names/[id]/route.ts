import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdminUser } from "@/lib/admin-user";
import {
  parseMarketAliases,
  validateMarketNameInput,
} from "@/lib/card-market-names";
import { createServiceClient } from "@/lib/supabase-server";

type ReviewAction = "approve" | "reject";

type ReviewBody = {
  action?: ReviewAction;
  marketName?: unknown;
  aliases?: unknown;
  note?: unknown;
};

function requestError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) return requestError("Admin authentication required.", 401);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  if (!body || (body.action !== "approve" && body.action !== "reject")) {
    return requestError("Choose approve or reject.");
  }

  const supabase = createServiceClient();

  if (body.action === "approve") {
    const parsedName = validateMarketNameInput(body.marketName);
    if (parsedName.error || !parsedName.marketName) return requestError(parsedName.error ?? "Invalid market name.");
    const aliases = parseMarketAliases(body.aliases).filter(
      (alias) => alias.toLowerCase() !== parsedName.marketName?.toLowerCase(),
    );

    const { error } = await supabase.rpc("approve_card_market_name_suggestion", {
      p_suggestion_id: id,
      p_market_name: parsedName.marketName,
      p_aliases: aliases,
      p_admin_user_id: currentUser.id,
    });

    if (error) return requestError(error.message, error.code === "PGRST116" ? 404 : 500);
  } else {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
    const { error } = await supabase.rpc("reject_card_market_name_suggestion", {
      p_suggestion_id: id,
      p_rejection_note: note || null,
      p_admin_user_id: currentUser.id,
    });

    if (error) return requestError(error.message, error.code === "PGRST116" ? 404 : 500);
  }

  revalidateTag("public-data");
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, status: body.action === "approve" ? "approved" : "rejected" });
}
