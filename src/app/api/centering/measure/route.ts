import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import {
  bgsCeilingBack,
  bgsCeilingFront,
  overlayGeometryFromUnknown,
  psaCeilingBack,
  psaCeilingFront,
  tagCeilingBack,
  tagCeilingFront,
} from "@/lib/centering-math";
import { isUploadFile } from "@/lib/inventory-scans";
import { createServiceClient } from "@/lib/supabase-server";
import type { operations } from "@/lib/owl-lens/openapi.generated";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MeasurementResponse =
  operations["measureCardCentering"]["responses"][200]["content"]["application/json"];
type CenteringFace = "front" | "back";

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase auth environment variables.");
  }

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}

async function requireAdminUser() {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    return null;
  }

  return user;
}

function cvMeasureUrl() {
  const baseUrl = process.env.OWL_LENS_CV_URL?.trim();
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/measure`;
}

function passthroughHeaders(response: Response) {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

function parseFace(value: FormDataEntryValue | null): CenteringFace | null {
  if (value === null || value === "") return "front";
  if (value === "front" || value === "back") return value;
  return null;
}

function parseOptionalUuid(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : undefined;
}

function parseOptionalText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseManualAdjustment(value: FormDataEntryValue | null) {
  return value === "true" || value === "1";
}

function parsePersist(value: FormDataEntryValue | null) {
  if (value === "false" || value === "0" || value === "no") return false;
  return true;
}

function measurementRow({
  inventoryItemId,
  response,
  face,
  cardSessionId,
  cardIdentity,
  manualAdjustment,
}: {
  inventoryItemId: string | null;
  response: MeasurementResponse;
  face: CenteringFace;
  cardSessionId: string | null;
  cardIdentity: string | null;
  manualAdjustment: boolean;
}) {
  return {
    inventory_item_id: inventoryItemId,
    request_id: crypto.randomUUID(),
    left_pct: response.centering.leftRight.leftPercent,
    right_pct: response.centering.leftRight.rightPercent,
    top_pct: response.centering.topBottom.topPercent,
    bottom_pct: response.centering.topBottom.bottomPercent,
    worst_axis: response.centering.worstAxis,
    worst_axis_max_pct: response.centering.worstAxisMaxPercent,
    psa_ceiling: face === "back"
      ? psaCeilingBack(response.centering.worstAxisMaxPercent)
      : psaCeilingFront(response.centering.worstAxisMaxPercent),
    bgs_ceiling: face === "back"
      ? bgsCeilingBack(response.centering.worstAxisMaxPercent)
      : bgsCeilingFront(response.centering.worstAxisMaxPercent),
    // Owl Lens is One Piece (TCG category); revisit when game-scope brings sports games.
    tag_ceiling: face === "back"
      ? tagCeilingBack(response.centering.worstAxisMaxPercent, "tcg")
      : tagCeilingFront(response.centering.worstAxisMaxPercent, "tcg"),
    pipeline_mode: response.pipeline.mode,
    pipeline_version: response.pipeline.version,
    processing_ms: response.metadata.processingMs,
    image_content_type: response.image.contentType,
    image_width_px: response.image.widthPx,
    image_height_px: response.image.heightPx,
    overlay: response.overlay,
    manual_adjustment: manualAdjustment,
    card_identity: cardIdentity,
    face,
    card_session_id: cardSessionId,
    overlay_geometry: overlayGeometryFromUnknown(response.overlay) ?? {},
  };
}

export async function POST(request: Request) {
  let adminUser;
  try {
    adminUser = await requireAdminUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid measurement upload" }, { status: 400 });
  }

  const inventoryItemIdEntry = formData.get("inventoryItemId");
  const inventoryItemId =
    typeof inventoryItemIdEntry === "string" && inventoryItemIdEntry.trim()
      ? inventoryItemIdEntry.trim()
      : null;
  const face = parseFace(formData.get("face"));
  if (!face) {
    return NextResponse.json({ error: "face must be front or back" }, { status: 400 });
  }

  const cardSessionId = parseOptionalUuid(formData.get("cardSessionId"));
  if (cardSessionId === undefined) {
    return NextResponse.json({ error: "cardSessionId must be a UUID" }, { status: 400 });
  }

  const cardIdentity = parseOptionalText(formData.get("cardIdentity"));
  const manualAdjustment = parseManualAdjustment(formData.get("manual_adjustment"));
  const persistResult = parsePersist(formData.get("persist"));

  const file = formData.get("file");
  if (!isUploadFile(file)) {
    return NextResponse.json({ error: "Choose a card image to measure" }, { status: 400 });
  }

  const supabase = inventoryItemId || persistResult ? createServiceClient() : null;
  if (inventoryItemId) {
    const { data: inventoryItem, error: inventoryError } = await supabase!
      .from("inventory_items")
      .select("id")
      .eq("id", inventoryItemId)
      .single();

    if (inventoryError || !inventoryItem) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }
  }

  const measureUrl = cvMeasureUrl();
  if (!measureUrl) {
    return NextResponse.json({ error: "OWL_LENS_CV_URL is not configured" }, { status: 500 });
  }

  const cvFormData = new FormData();
  cvFormData.set("file", file);

  let cvResponse: Response;
  try {
    cvResponse = await fetch(measureUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
      },
      body: cvFormData,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Owl Lens CV service is unavailable" }, { status: 502 });
  }

  const responseBody = await cvResponse.text();
  const headers = passthroughHeaders(cvResponse);

  if (!cvResponse.ok) {
    return new Response(responseBody, {
      status: cvResponse.status,
      headers,
    });
  }

  let measurement: MeasurementResponse;
  try {
    measurement = JSON.parse(responseBody) as MeasurementResponse;
  } catch {
    return NextResponse.json({ error: "Owl Lens CV service returned invalid JSON" }, { status: 502 });
  }

  if (persistResult) {
    const { error: insertError } = await supabase!
      .from("centering_measurements")
      .insert(
        measurementRow({
          inventoryItemId,
          response: measurement,
          face,
          cardSessionId,
          cardIdentity,
          manualAdjustment,
        })
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return new Response(responseBody, {
    status: cvResponse.status,
    headers,
  });
}
