import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";

export type CurrentAdminUser = {
  id: string;
  email: string | null;
};

export async function getCurrentAdminUser(): Promise<CurrentAdminUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server components cannot set cookies; API routes can.
        }
      },
      remove(name: string, options) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Server components cannot set cookies; API routes can.
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) return null;

  return {
    id: user.id,
    email: user.email ?? null,
  };
}
