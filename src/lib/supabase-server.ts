import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function decodeJwtPayload(token: string): { role?: string } | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function getServiceClientConfigError() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) return "Missing NEXT_PUBLIC_SUPABASE_URL on the server.";
  if (!key) return "Missing SUPABASE_SERVICE_ROLE_KEY on the server.";

  const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (publicAnonKey && key === publicAnonKey) {
    return "SUPABASE_SERVICE_ROLE_KEY is set to the anon key. Use the legacy service_role secret key.";
  }

  if (!key.startsWith("eyJ")) {
    return "SUPABASE_SERVICE_ROLE_KEY must be the legacy service_role JWT key that starts with eyJ, not the sb_secret key.";
  }

  const payload = decodeJwtPayload(key);
  if (payload?.role !== "service_role") {
    return "SUPABASE_SERVICE_ROLE_KEY is not a service_role key. Use the legacy service_role secret key.";
  }

  return null;
}

export function createServiceClient() {
  const configError = getServiceClientConfigError();
  if (configError) {
    throw new Error(configError);
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, {
            ...options,
            cache: "no-store",
          }),
      },
    }
  );
}
