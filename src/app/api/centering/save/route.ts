import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import {
  type BgsGrade,
  bgsCeilingBack,
  bgsCeilingFront,
  computeMeasurements,
  legacyOverlayFromGeometry,
  overlayGeometryFromUnknown,
  overlayImageBounds,
  overlaysEquivalent,
  type OverlayGeometry,
  psaCeilingBack,
  psaCeilingFront,
  type PsaGrade,
  type TagGrade,
  tagCeilingBack,
  tagCeilingFront,
} from "@/lib/centering-math";
import { isUploadFile } from "@/lib/inventory-scans";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CENTERING_IMAGES_BUCKET = "centering-images";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type CenteringFace = "front" | "back";
type PipelineMode = "mock" | "opencv";

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase auth environment variables.");
  }

  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
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

function parseString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalText(value: FormDataEntryValue | null) {
  const trimmed = parseString(value);
  return trimmed ? trimmed : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseFace(value: FormDataEntryValue | null): CenteringFace | null {
  const face = parseString(value) || "front";
  if (face === "front" || face === "back") return face;
  return null;
}

function parseOptionalUuid(value: FormDataEntryValue | null) {
  const trimmed = parseString(value);
  if (!trimmed) return null;
  return isUuid(trimmed) ? trimmed : undefined;
}

function parsePositiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(parseString(value));
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePipelineMode(value: FormDataEntryValue | null): PipelineMode | null {
  const mode = parseString(value) || "mock";
  if (mode === "mock" || mode === "opencv") return mode;
  return null;
}

function parseBoolean(value: FormDataEntryValue | null) {
  return parseString(value).toLowerCase() === "true";
}

function parseJsonField(value: FormDataEntryValue | null) {
  const raw = parseString(value);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseOverlay(value: FormDataEntryValue | null): OverlayGeometry | null | undefined {
  const parsed = parseJsonField(value);
  if (parsed === undefined) return undefined;
  if (parsed === null) return null;
  return overlayGeometryFromUnknown(parsed);
}

function parseFirstOverlay(formData: FormData, names: string[]) {
  for (const name of names) {
    const parsed = parseOverlay(formData.get(name));
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}

function responseError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function storagePath(userId: string, cardSessionId: string, face: CenteringFace, contentType: string) {
  const extension = IMAGE_EXTENSIONS.get(contentType) ?? "jpg";
  return `${userId}/${cardSessionId}/${face}.${extension}`;
}

function manualAdjustmentFromOverlay(overlay: OverlayGeometry, cvOverlay: OverlayGeometry | null | undefined) {
  if (!cvOverlay) return true;
  return !overlaysEquivalent(overlay, cvOverlay);
}

function measurementRow({
  inventoryItemId,
  overlay,
  imageContentType,
  imageWidthPx,
  imageHeightPx,
  pipelineMode,
  pipelineVersion,
  processingMs,
  cardIdentity,
  face,
  cardSessionId,
  imageUrl,
  manualAdjustment,
}: {
  inventoryItemId: string | null;
  overlay: OverlayGeometry;
  imageContentType: string;
  imageWidthPx: number;
  imageHeightPx: number;
  pipelineMode: PipelineMode;
  pipelineVersion: string;
  processingMs: number;
  cardIdentity: string | null;
  face: CenteringFace;
  cardSessionId: string;
  imageUrl: string;
  manualAdjustment: boolean;
}) {
  const measurement = computeMeasurements(overlay);
  const psaCeiling: PsaGrade = face === "back"
    ? psaCeilingBack(measurement.worstAxisMaxPct)
    : psaCeilingFront(measurement.worstAxisMaxPct);
  const bgsCeiling: BgsGrade = face === "back"
    ? bgsCeilingBack(measurement.worstAxisMaxPct)
    : bgsCeilingFront(measurement.worstAxisMaxPct);
  // Owl Lens is One Piece (TCG category); revisit when game-scope brings sports games.
  const tagCeiling: TagGrade = face === "back"
    ? tagCeilingBack(measurement.worstAxisMaxPct, "tcg")
    : tagCeilingFront(measurement.worstAxisMaxPct, "tcg");

  return {
    inventory_item_id: inventoryItemId,
    request_id: crypto.randomUUID(),
    left_pct: measurement.leftPct,
    right_pct: measurement.rightPct,
    top_pct: measurement.topPct,
    bottom_pct: measurement.bottomPct,
    worst_axis: measurement.worstAxis,
    worst_axis_max_pct: measurement.worstAxisMaxPct,
    psa_ceiling: psaCeiling,
    bgs_ceiling: bgsCeiling,
    tag_ceiling: tagCeiling,
    pipeline_mode: pipelineMode,
    pipeline_version: pipelineVersion,
    processing_ms: processingMs,
    image_content_type: imageContentType,
    image_width_px: imageWidthPx,
    image_height_px: imageHeightPx,
    overlay: legacyOverlayFromGeometry(overlay),
    manual_adjustment: manualAdjustment,
    card_identity: cardIdentity,
    face,
    card_session_id: cardSessionId,
    image_url: imageUrl,
    overlay_geometry: overlay,
  };
}

async function persistMeasurementRow({
  supabase,
  row,
  cardSessionId,
  face,
  updateExisting,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  row: ReturnType<typeof measurementRow>;
  cardSessionId: string;
  face: CenteringFace;
  updateExisting: boolean;
}) {
  if (updateExisting) {
    const existingResult = await supabase
      .from("centering_measurements")
      .select("id")
      .eq("card_session_id", cardSessionId)
      .eq("face", face);

    if (existingResult.error) {
      return {
        operation: "update" as const,
        data: null,
        error: existingResult.error,
      };
    }

    const ids = (existingResult.data ?? [])
      .map((measurement) => measurement.id)
      .filter((id): id is string => typeof id === "string");

    if (ids.length > 0) {
      const updateResult = await supabase
        .from("centering_measurements")
        .update(row)
        .in("id", ids)
        .select("*");

      return {
        operation: "update" as const,
        data: updateResult.data?.[0] ?? null,
        error: updateResult.error,
      };
    }
  }

  const insertResult = await supabase
    .from("centering_measurements")
    .insert(row)
    .select("*")
    .single();

  return {
    operation: "insert" as const,
    data: insertResult.data ?? null,
    error: insertResult.error,
  };
}

export async function POST(request: Request) {
  let adminUser;
  try {
    adminUser = await requireAdminUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication is not configured.";
    return responseError(message, 500);
  }

  if (!adminUser) {
    return responseError("Unauthorized", 401);
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return responseError("Invalid save payload", 400);
  }

  const face = parseFace(formData.get("face"));
  if (!face) {
    return responseError("face must be front or back", 400);
  }

  const parsedCardSessionId = parseOptionalUuid(formData.get("cardSessionId"));
  if (parsedCardSessionId === undefined) {
    return responseError("cardSessionId must be a UUID", 400);
  }
  const cardSessionId = parsedCardSessionId ?? crypto.randomUUID();

  const overlay = parseFirstOverlay(formData, ["overlayGeometry", "overlay"]);
  if (!overlay) {
    return responseError("overlayGeometry must be a valid quad overlay", 400);
  }

  const cvOverlay = parseFirstOverlay(formData, [
    "cvOverlayGeometry",
    "cvOverlay",
    "originalOverlayGeometry",
  ]);
  if (cvOverlay === null) {
    return responseError("cvOverlayGeometry must be a valid quad overlay", 400);
  }

  const file = formData.get("image") ?? formData.get("file");
  if (!isUploadFile(file)) {
    return responseError("Choose a card image to save", 400);
  }

  if (!IMAGE_EXTENSIONS.has(file.type)) {
    return responseError("Image must be a JPEG, PNG, or WEBP file", 415);
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return responseError("Image is larger than 20 MB", 413);
  }

  const pipelineMode = parsePipelineMode(formData.get("pipelineMode"));
  if (!pipelineMode) {
    return responseError("pipelineMode must be mock or opencv", 400);
  }

  const pipelineVersion = parseOptionalText(formData.get("pipelineVersion")) ?? "manual-save";
  const updateExisting = parseBoolean(formData.get("updateExisting"));
  const processingMs = parsePositiveInteger(formData.get("processingMs")) ?? 0;
  const cardIdentity = parseOptionalText(formData.get("cardIdentity"));
  const inventoryItemId = parseOptionalText(formData.get("inventoryItemId"));
  const inferredBounds = overlayImageBounds(overlay);
  const imageWidthPx = parsePositiveInteger(formData.get("imageWidthPx")) ?? inferredBounds.width;
  const imageHeightPx = parsePositiveInteger(formData.get("imageHeightPx")) ?? inferredBounds.height;
  const manualAdjustment = manualAdjustmentFromOverlay(overlay, cvOverlay);

  const supabase = createServiceClient();
  if (inventoryItemId) {
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("id", inventoryItemId)
      .single();

    if (inventoryError || !inventoryItem) {
      return responseError("Inventory item not found", 404);
    }
  }

  const imagePath = storagePath(adminUser.id, cardSessionId, face, file.type);
  const storage = supabase.storage.from(CENTERING_IMAGES_BUCKET);
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await storage.upload(imagePath, bytes, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    return responseError(uploadError.message, 500);
  }

  const row = measurementRow({
    inventoryItemId,
    overlay,
    imageContentType: file.type,
    imageWidthPx,
    imageHeightPx,
    pipelineMode,
    pipelineVersion,
    processingMs,
    cardIdentity,
    face,
    cardSessionId,
    imageUrl: imagePath,
    manualAdjustment,
  });

  const saveResult = await persistMeasurementRow({
    supabase,
    row,
    cardSessionId,
    face,
    updateExisting,
  });

  if (saveResult.error) {
    if (saveResult.operation === "insert") {
      await storage.remove([imagePath]).catch(() => null);
    }
    return responseError(saveResult.error.message, 500);
  }

  return NextResponse.json({
    measurement: saveResult.data ?? row,
    cardSessionId,
    face,
    imageUrl: imagePath,
    updatedExisting: saveResult.operation === "update",
  });
}
