import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CENTERING_IMAGES_BUCKET = "centering-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SESSION_SELECT =
  "id, created_at, inventory_item_id, card_identity, face, card_session_id, image_url, overlay, overlay_geometry, left_pct, right_pct, top_pct, bottom_pct, worst_axis, worst_axis_max_pct, psa_ceiling, manual_adjustment";

type CenteringFace = "front" | "back";
type PsaCeiling = "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";

type MeasurementRow = {
  id: string;
  created_at: string | null;
  inventory_item_id: string | null;
  card_identity: string | null;
  face: CenteringFace | string | null;
  card_session_id: string | null;
  image_url: string | null;
  overlay: unknown;
  overlay_geometry: unknown;
  left_pct: string | number | null;
  right_pct: string | number | null;
  top_pct: string | number | null;
  bottom_pct: string | number | null;
  worst_axis: "leftRight" | "topBottom";
  worst_axis_max_pct: string | number | null;
  psa_ceiling: PsaCeiling;
  manual_adjustment: boolean | null;
};

type FacePayload = {
  id: string;
  face: CenteringFace;
  createdAt: string | null;
  imagePath: string | null;
  signedImageUrl: string | null;
  overlayGeometry: unknown;
  legacyOverlay: unknown;
  leftPct: number | null;
  rightPct: number | null;
  topPct: number | null;
  bottomPct: number | null;
  worstAxis: "leftRight" | "topBottom";
  worstAxisMaxPct: number | null;
  psaCeiling: PsaCeiling;
  manualAdjustment: boolean;
};

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

function responseError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function numeric(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ceilingRank(ceiling: PsaCeiling) {
  switch (ceiling) {
    case "PSA_10":
      return 10;
    case "PSA_9":
      return 9;
    case "PSA_8":
      return 8;
    case "PSA_7":
      return 7;
    default:
      return 6;
  }
}

function worseCeiling(a: PsaCeiling, b: PsaCeiling) {
  return ceilingRank(a) <= ceilingRank(b) ? a : b;
}

function isStoragePath(value: string) {
  return !/^https?:\/\//i.test(value);
}

async function signedUrlForPath(supabase: ReturnType<typeof createServiceClient>, imagePath: string | null) {
  if (!imagePath) return null;
  if (!isStoragePath(imagePath)) return imagePath;

  const { data, error } = await supabase.storage
    .from(CENTERING_IMAGES_BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(error.message);
  }

  return data?.signedUrl ?? null;
}

async function facePayload(supabase: ReturnType<typeof createServiceClient>, row: MeasurementRow): Promise<FacePayload> {
  const face = row.face === "back" ? "back" : "front";

  return {
    id: row.id,
    face,
    createdAt: row.created_at,
    imagePath: row.image_url,
    signedImageUrl: await signedUrlForPath(supabase, row.image_url),
    overlayGeometry: row.overlay_geometry,
    legacyOverlay: row.overlay,
    leftPct: numeric(row.left_pct),
    rightPct: numeric(row.right_pct),
    topPct: numeric(row.top_pct),
    bottomPct: numeric(row.bottom_pct),
    worstAxis: row.worst_axis,
    worstAxisMaxPct: numeric(row.worst_axis_max_pct),
    psaCeiling: row.psa_ceiling,
    manualAdjustment: Boolean(row.manual_adjustment),
  };
}

async function sessionPayload(supabase: ReturnType<typeof createServiceClient>, rows: MeasurementRow[], id: string) {
  let ceiling = rows[0]?.psa_ceiling ?? "BELOW_PSA_7";
  let cardIdentity = rows[0]?.card_identity ?? null;
  let createdAt = rows[0]?.created_at ?? null;
  let manualAdjustment = false;
  let front: FacePayload | null = null;
  let back: FacePayload | null = null;

  for (const row of rows) {
    const face = await facePayload(supabase, row);
    ceiling = worseCeiling(ceiling, row.psa_ceiling);
    if (!cardIdentity && row.card_identity) cardIdentity = row.card_identity;
    if (!createdAt || (row.created_at && row.created_at > createdAt)) createdAt = row.created_at;
    manualAdjustment = manualAdjustment || Boolean(row.manual_adjustment);

    if (face.face === "back") {
      back = face;
    } else {
      front = face;
    }
  }

  return {
    id,
    cardSessionId: rows[0]?.card_session_id ?? null,
    cardIdentity,
    createdAt,
    ceiling,
    manualAdjustment,
    front,
    back,
  };
}

async function loadRowsForSession(supabase: ReturnType<typeof createServiceClient>, id: string) {
  const bySession = await supabase
    .from("centering_measurements")
    .select(SESSION_SELECT)
    .eq("card_session_id", id)
    .order("created_at", { ascending: false });

  if (bySession.error) {
    return { rows: null, error: bySession.error };
  }

  if ((bySession.data ?? []).length > 0) {
    return { rows: bySession.data as MeasurementRow[], error: null };
  }

  const byId = await supabase
    .from("centering_measurements")
    .select(SESSION_SELECT)
    .eq("id", id)
    .order("created_at", { ascending: false });

  if (byId.error) {
    return { rows: null, error: byId.error };
  }

  return { rows: (byId.data ?? []) as MeasurementRow[], error: null };
}

async function requireAdmin() {
  try {
    const user = await requireAdminUser();
    if (!user) return { user: null, response: responseError("Unauthorized", 401) };
    return { user, response: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication is not configured.";
    return { user: null, response: responseError(message, 500) };
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (!isUuid(params.id)) return responseError("Session id must be a UUID", 400);

  const supabase = createServiceClient();
  const { rows, error } = await loadRowsForSession(supabase, params.id);
  if (error) return responseError(error.message, 500);
  if (!rows || rows.length === 0) return responseError("Session not found", 404);

  try {
    return NextResponse.json({ session: await sessionPayload(supabase, rows, params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create signed image URLs";
    return responseError(message, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (!isUuid(params.id)) return responseError("Session id must be a UUID", 400);

  const supabase = createServiceClient();
  const { rows, error } = await loadRowsForSession(supabase, params.id);
  if (error) return responseError(error.message, 500);
  if (!rows || rows.length === 0) return responseError("Session not found", 404);

  const storagePaths = rows
    .map((row) => row.image_url)
    .filter((value): value is string => Boolean(value && isStoragePath(value)));

  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(CENTERING_IMAGES_BUCKET).remove(storagePaths);
    if (removeError) {
      return responseError(removeError.message, 500);
    }
  }

  const ids = rows.map((row) => row.id);
  const deleteResult = await supabase.from("centering_measurements").delete().in("id", ids);
  if (deleteResult.error) {
    return responseError(deleteResult.error.message, 500);
  }

  return NextResponse.json({
    deleted: ids.length,
    storageObjectsDeleted: storagePaths.length,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (!isUuid(params.id)) return responseError("Session id must be a UUID", 400);

  const body = await request.json().catch(() => null);
  const rawCardIdentity =
    body && typeof body === "object" && "cardIdentity" in body
      ? (body as { cardIdentity?: unknown }).cardIdentity
      : body && typeof body === "object" && "card_identity" in body
        ? (body as { card_identity?: unknown }).card_identity
        : undefined;

  if (typeof rawCardIdentity !== "string" && rawCardIdentity !== null) {
    return responseError("cardIdentity must be a string or null", 400);
  }

  const cardIdentity = typeof rawCardIdentity === "string" && rawCardIdentity.trim()
    ? rawCardIdentity.trim()
    : null;
  const supabase = createServiceClient();
  const { rows, error } = await loadRowsForSession(supabase, params.id);
  if (error) return responseError(error.message, 500);
  if (!rows || rows.length === 0) return responseError("Session not found", 404);

  const ids = rows.map((row) => row.id);
  const updateResult = await supabase
    .from("centering_measurements")
    .update({ card_identity: cardIdentity })
    .in("id", ids)
    .select(SESSION_SELECT);

  if (updateResult.error) {
    return responseError(updateResult.error.message, 500);
  }

  const updatedRows = ((updateResult.data ?? rows.map((row) => ({ ...row, card_identity: cardIdentity }))) as MeasurementRow[]);

  try {
    return NextResponse.json({ session: await sessionPayload(supabase, updatedRows, params.id) });
  } catch (signError) {
    const message = signError instanceof Error ? signError.message : "Could not create signed image URLs";
    return responseError(message, 500);
  }
}
