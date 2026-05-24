import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminGameOption = {
  slug: string;
  name: string;
  isPublic: boolean;
};

type GameRow = {
  slug: string;
  name: string;
  is_public: boolean | null;
};

export async function loadAdminGameOptions(supabase: SupabaseClient): Promise<AdminGameOption[]> {
  const { data, error } = await supabase
    .from("games")
    .select("slug, name, is_public")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  return ((data ?? []) as GameRow[]).map((game) => ({
    slug: game.slug,
    name: game.name,
    isPublic: game.is_public !== false,
  }));
}
