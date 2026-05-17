import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivateCustomCardRow = {
  id: string;
  user_id: string;
  name: string;
  card_number: string | null;
  set_code: string | null;
  image_url: string | null;
  image_url_small: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PrivateCustomCardInput = {
  name: string;
  card_number?: string | null;
  set_code?: string | null;
  image_url?: string | null;
  image_url_small?: string | null;
  notes?: string | null;
};

export const PRIVATE_CUSTOM_CARD_SELECT =
  "id, user_id, name, card_number, set_code, image_url, image_url_small, notes, created_at, updated_at";

export function isMissingPrivateCustomCardsError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("custom_cards") ||
    message.includes("private custom") ||
    (message.includes("schema cache") && message.includes("custom"))
  );
}

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function findExistingPrivateCustomCard(
  supabase: SupabaseClient,
  userId: string,
  input: Required<Pick<PrivateCustomCardInput, "name">> & PrivateCustomCardInput
) {
  let query = supabase
    .from("custom_cards")
    .select(PRIVATE_CUSTOM_CARD_SELECT)
    .eq("user_id", userId)
    .ilike("name", input.name);

  const setCode = normalizeString(input.set_code);
  const cardNumber = normalizeString(input.card_number);
  query = setCode ? query.ilike("set_code", setCode) : query.is("set_code", null);
  query = cardNumber ? query.ilike("card_number", cardNumber) : query.is("card_number", null);

  const { data, error } = await query.limit(1);

  if (error) {
    return { card: null, error };
  }

  return { card: ((data ?? [])[0] as PrivateCustomCardRow | undefined) ?? null, error: null };
}

export async function getPrivateCustomCard(
  supabase: SupabaseClient,
  userId: string,
  customCardId: string
) {
  const { data, error } = await supabase
    .from("custom_cards")
    .select(PRIVATE_CUSTOM_CARD_SELECT)
    .eq("user_id", userId)
    .eq("id", customCardId)
    .single();

  if (error) {
    return { card: null, error };
  }

  return { card: data as PrivateCustomCardRow, error: null };
}

export async function loadPrivateCustomCardsByIds(
  supabase: SupabaseClient,
  userId: string | null,
  customCardIds: string[]
) {
  if (!userId || customCardIds.length === 0) {
    return { cards: new Map<string, PrivateCustomCardRow>(), error: null };
  }

  const { data, error } = await supabase
    .from("custom_cards")
    .select(PRIVATE_CUSTOM_CARD_SELECT)
    .eq("user_id", userId)
    .in("id", customCardIds);

  if (error) {
    return { cards: new Map<string, PrivateCustomCardRow>(), error };
  }

  return {
    cards: new Map(((data ?? []) as PrivateCustomCardRow[]).map((card) => [card.id, card])),
    error: null,
  };
}

export async function loadPrivateCustomCardsForUser(supabase: SupabaseClient, userId: string | null) {
  if (!userId) return { cards: [] as PrivateCustomCardRow[], error: null };

  const { data, error } = await supabase
    .from("custom_cards")
    .select(PRIVATE_CUSTOM_CARD_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(5000);

  if (error) {
    return { cards: [] as PrivateCustomCardRow[], error };
  }

  return { cards: (data ?? []) as PrivateCustomCardRow[], error: null };
}

export async function findOrCreatePrivateCustomCard(
  supabase: SupabaseClient,
  userId: string,
  input: PrivateCustomCardInput
) {
  const name = normalizeString(input.name);
  if (!name) {
    return { card: null, error: new Error("Private card name is required.") };
  }

  const normalizedInput = {
    name: normalizeName(name),
    card_number: normalizeString(input.card_number),
    set_code: normalizeString(input.set_code),
    image_url: normalizeString(input.image_url),
    image_url_small: normalizeString(input.image_url_small),
    notes: normalizeString(input.notes),
  };

  const existing = await findExistingPrivateCustomCard(supabase, userId, normalizedInput);
  if (existing.error) {
    return { card: null, error: existing.error };
  }

  if (existing.card) {
    const imageUpdates: Record<string, string> = {};
    if (normalizedInput.image_url && !existing.card.image_url) imageUpdates.image_url = normalizedInput.image_url;
    if (normalizedInput.image_url_small && !existing.card.image_url_small) {
      imageUpdates.image_url_small = normalizedInput.image_url_small;
    }

    if (Object.keys(imageUpdates).length > 0) {
      const { data, error } = await supabase
        .from("custom_cards")
        .update({ ...imageUpdates, updated_at: new Date().toISOString() })
        .eq("id", existing.card.id)
        .eq("user_id", userId)
        .select(PRIVATE_CUSTOM_CARD_SELECT)
        .single();

      if (error) return { card: existing.card, error: null };
      return { card: data as PrivateCustomCardRow, error: null };
    }

    return { card: existing.card, error: null };
  }

  const { data, error } = await supabase
    .from("custom_cards")
    .insert({
      user_id: userId,
      name: normalizedInput.name,
      card_number: normalizedInput.card_number,
      set_code: normalizedInput.set_code,
      image_url: normalizedInput.image_url,
      image_url_small: normalizedInput.image_url_small,
      notes: normalizedInput.notes,
      updated_at: new Date().toISOString(),
    })
    .select(PRIVATE_CUSTOM_CARD_SELECT)
    .single();

  if (error) {
    const duplicate = await findExistingPrivateCustomCard(supabase, userId, normalizedInput);
    if (duplicate.card) return { card: duplicate.card, error: null };
    return { card: null, error };
  }

  return { card: data as PrivateCustomCardRow, error: null };
}

export async function updatePrivateCustomCardImages(
  supabase: SupabaseClient,
  userId: string,
  customCardId: string,
  imageUrl: string | null,
  imageUrlSmall?: string | null
) {
  const updates: Record<string, string> = {};
  if (imageUrl) updates.image_url = imageUrl;
  if (imageUrlSmall) updates.image_url_small = imageUrlSmall;
  if (Object.keys(updates).length === 0) return { error: null };

  const { error } = await supabase
    .from("custom_cards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", customCardId)
    .eq("user_id", userId);

  return { error };
}
