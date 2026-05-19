import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import { gradeRank, type PsaCeiling } from "@/lib/centering-math";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CENTERING_IMAGES_BUCKET = "centering-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type CenteringFace = "front" | "back";
type CeilingFilter = "all" | "10" | "9" | "8" | "7-";

type MeasurementRow = {
  id: string;
  created_at: string | null;
  inventory_item_id: string | null;
  card_identity: string | null;
  face: CenteringFace | string | null;
  card_session_id: string | null;
  image_url: string | null;
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
  leftPct: number | null;
  rightPct: number | null;
  topPct: number | null;
  bottomPct: number | null;
  worstAxis: "leftRight" | "topBottom";
  worstAxisMaxPct: number | null;
  psaCeiling: PsaCeiling;
  manualAdjustment: boolean;
};

type SessionPayload = {
  id: string;
  cardSessionId: string | null;
  cardIdentity: string | null;
  createdAt: string | null;
  ceiling: PsaCeiling;
  manualAdjustment: boolean;
  front: FacePayload | null;
  back: FacePayload | null;
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

function numeric(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function worseCeiling(a: PsaCeiling, b: PsaCeiling) {
  return gradeRank(a) <= gradeRank(b) ? a : b;
}

function ceilingMatchesFilter(ceiling: PsaCeiling, filter: CeilingFilter) {
  if (filter === "all") return true;
  if (filter === "10") return ceiling === "PSA_10";
  if (filter === "9") return ceiling === "PSA_9";
  if (filter === "8") return ceiling === "PSA_8";
  return !["PSA_10", "PSA_9", "PSA_8"].includes(ceiling);
}

function parseCeilingFilter(value: string | null): CeilingFilter {
  if (value === "10" || value === "9" || value === "8" || value === "7-") return value;
  return "all";
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

  if (error) return null;
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

async function groupRows(supabase: ReturnType<typeof createServiceClient>, rows: MeasurementRow[]) {
  const groups = new Map<string, SessionPayload>();

  for (const row of rows) {
    const groupId = row.card_session_id ?? row.id;
    let group = groups.get(groupId);
    const face = await facePayload(supabase, row);

    if (!group) {
      group = {
        id: groupId,
        cardSessionId: row.card_session_id,
        cardIdentity: row.card_identity,
        createdAt: row.created_at,
        ceiling: row.psa_ceiling,
        manualAdjustment: Boolean(row.manual_adjustment),
        front: null,
        back: null,
      };
      groups.set(groupId, group);
    }

    if (!group.cardIdentity && row.card_identity) group.cardIdentity = row.card_identity;
    if (!group.createdAt || (row.created_at && row.created_at > group.createdAt)) group.createdAt = row.created_at;
    group.ceiling = worseCeiling(group.ceiling, row.psa_ceiling);
    group.manualAdjustment = group.manualAdjustment || Boolean(row.manual_adjustment);

    if (face.face === "back") {
      group.back = face;
    } else {
      group.front = face;
    }
  }

  return Array.from(groups.values()).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const ceiling = parseCeilingFilter(url.searchParams.get("ceiling"));
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("centering_measurements")
    .select(
      "id, created_at, inventory_item_id, card_identity, face, card_session_id, image_url, overlay_geometry, left_pct, right_pct, top_pct, bottom_pct, worst_axis, worst_axis_max_pct, psa_ceiling, manual_adjustment"
    )
    .is("inventory_item_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return responseError(error.message, 500);
  }

  const sessions = await groupRows(supabase, ((data ?? []) as MeasurementRow[])).then((groups) =>
    groups.filter((group) => {
      if (search && !(group.cardIdentity ?? "").toLowerCase().includes(search)) return false;
      return ceilingMatchesFilter(group.ceiling, ceiling);
    })
  );

  return NextResponse.json({
    rows: sessions,
    count: sessions.length,
    filters: {
      search,
      ceiling,
    },
  });
}
