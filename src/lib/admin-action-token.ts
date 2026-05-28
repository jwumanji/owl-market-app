import { createHmac, timingSafeEqual } from "node:crypto";
import type { CurrentAdminUser } from "@/lib/admin-user";

export const CENTERING_MEASURE_ACTION = "centering:measure";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

type AdminActionTokenPayload = {
  v: number;
  sub: string;
  email: string | null;
  action: string;
  exp: number;
};

type VerifyResult =
  | { ok: true; user: CurrentAdminUser }
  | { ok: false; reason: "missing" | "malformed" | "invalid" | "expired" | "wrong-action" | "unconfigured" };

function tokenSecret() {
  return (
    process.env.ADMIN_ACTION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminActionToken({
  user,
  action,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: {
  user: CurrentAdminUser;
  action: string;
  ttlSeconds?: number;
}) {
  const secret = tokenSecret();
  if (!secret) {
    throw new Error("ADMIN_ACTION_SECRET, SUPABASE_SERVICE_ROLE_KEY, or CRON_SECRET is required.");
  }

  const payload: AdminActionTokenPayload = {
    v: TOKEN_VERSION,
    sub: user.id,
    email: user.email,
    action,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyAdminActionToken(token: string | null | undefined, action: string): VerifyResult {
  if (!token) return { ok: false, reason: "missing" };

  const secret = tokenSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [body, signature] = parts;
  if (!safeEqual(signature, sign(body, secret))) {
    return { ok: false, reason: "invalid" };
  }

  let payload: AdminActionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminActionTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.v !== TOKEN_VERSION || typeof payload.sub !== "string" || !payload.sub) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.action !== action) {
    return { ok: false, reason: "wrong-action" };
  }

  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    user: {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    },
  };
}
