import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: unknown;
  password?: unknown;
  redirectTo?: unknown;
};

function safeRedirectPath(value: unknown) {
  if (typeof value !== "string") return "/admin/inventory";
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return "/admin/inventory";
  }
  return trimmed;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const redirectTo = safeRedirectPath(body?.redirectTo);

  if (!email || !password) {
    return jsonError("Enter an email and password.", 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return jsonError("Authentication is not configured.", 500);
  }

  const cookieStore = await cookies();
  const response = NextResponse.json(
    { ok: true, redirectTo },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return jsonError(error.message, 401);
  }

  if (!data.user || !isAllowedAdminEmail(data.user.email)) {
    return jsonError("This account is not allowed to access internal tools.", 403);
  }

  return response;
}
