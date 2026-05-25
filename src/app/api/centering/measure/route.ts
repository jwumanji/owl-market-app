import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import { resolveGameScope } from "@/lib/game-scope";
import { isUploadFile } from "@/lib/inventory-scans";
import { createServiceClient } from "@/lib/supabase-server";
import type { operations } from "@/lib/owl-lens/openapi.generated";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MeasurementResponse =
  operations["measureCardCentering"]["responses"][200]["content"]["application/json"];

type JsonRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNumber(record: JsonRecord, key: string) {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

function hasString(record: JsonRecord, key: string) {
  return typeof record[key] === "string" && record[key].length > 0;
}

function isMeasurementResponse(value: unknown): value is MeasurementResponse {
  if (!isRecord(value)) return false;
  const image = value.image;
  const centering = value.centering;
  const psa = value.psa;
  const pipeline = value.pipeline;
  const metadata = value.metadata;
  const overlay = value.overlay;

  if (!isRecord(image) || !hasString(image, "contentType") || !hasNumber(image, "widthPx") || !hasNumber(image, "heightPx")) {
    return false;
  }
  if (!isRecord(centering)) return false;

  const leftRight = centering.leftRight;
  const topBottom = centering.topBottom;
  if (!isRecord(leftRight) || !hasNumber(leftRight, "leftPercent") || !hasNumber(leftRight, "rightPercent")) {
    return false;
  }
  if (!isRecord(topBottom) || !hasNumber(topBottom, "topPercent") || !hasNumber(topBottom, "bottomPercent")) {
    return false;
  }
  if (!hasString(centering, "worstAxis") || !hasNumber(centering, "worstAxisMaxPercent")) {
    return false;
  }
  if (!isRecord(psa) || !hasString(psa, "ceiling")) {
    return false;
  }
  if (!isRecord(pipeline) || !hasString(pipeline, "mode") || !hasString(pipeline, "version")) {
    return false;
  }
  if (!isRecord(metadata) || !hasNumber(metadata, "processingMs")) {
    return false;
  }
  if (!isRecord(overlay)) {
    return false;
  }

  return true;
}

function measurementRow(gameId: string, inventoryItemId: string | null, response: MeasurementResponse) {
  return {
    game_id: gameId,
    inventory_item_id: inventoryItemId,
    request_id: crypto.randomUUID(),
    left_pct: response.centering.leftRight.leftPercent,
    right_pct: response.centering.leftRight.rightPercent,
    top_pct: response.centering.topBottom.topPercent,
    bottom_pct: response.centering.topBottom.bottomPercent,
    worst_axis: response.centering.worstAxis,
    worst_axis_max_pct: response.centering.worstAxisMaxPercent,
    psa_ceiling: response.psa.ceiling,
    pipeline_mode: response.pipeline.mode,
    pipeline_version: response.pipeline.version,
    processing_ms: response.metadata.processingMs,
    image_content_type: response.image.contentType,
    image_width_px: response.image.widthPx,
    image_height_px: response.image.heightPx,
    overlay: response.overlay,
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
  const gameEntry = formData.get("game");
  const requestedGame = typeof gameEntry === "string" && gameEntry.trim() ? gameEntry.trim() : null;

  const file = formData.get("file");
  if (!isUploadFile(file)) {
    return NextResponse.json({ error: "Choose a card image to measure" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, requestedGame);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  if (inventoryItemId) {
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("id, game_id")
      .eq("id", inventoryItemId)
      .eq("game_id", game.id)
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

  if (cvResponse.status >= 500) {
    return NextResponse.json(
      { error: "Owl Lens CV service failed", upstreamStatus: cvResponse.status },
      { status: 502 }
    );
  }

  if (!cvResponse.ok) {
    return new Response(responseBody, {
      status: cvResponse.status,
      headers,
    });
  }

  let measurement: MeasurementResponse;
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (!isMeasurementResponse(parsed)) {
      return NextResponse.json({ error: "Owl Lens CV service returned an invalid measurement response" }, { status: 502 });
    }
    measurement = parsed;
  } catch {
    return NextResponse.json({ error: "Owl Lens CV service returned invalid JSON" }, { status: 502 });
  }

  const { error: insertError } = await supabase
    .from("centering_measurements")
    .insert(measurementRow(game.id, inventoryItemId, measurement));

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return new Response(responseBody, {
    status: cvResponse.status,
    headers,
  });
}
