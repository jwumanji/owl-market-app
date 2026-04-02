const BASE_URL = "https://optcgapi.com/api";

async function safeFetch<T>(url: string, label: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[optcgapi] ${label} failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    console.error(`[optcgapi] ${label} error:`, err);
    return [];
  }
}

/** Fetch all cards in a set by set ID (e.g. "OP01") */
export async function fetchSetCards(setId: string) {
  return safeFetch(`${BASE_URL}/sets/${setId}/`, `fetchSetCards(${setId})`);
}

/** Fetch card(s) by card number — may return multiple variants (e.g. base + parallel) */
export async function fetchCardByNumber(cardNumber: string) {
  return safeFetch(
    `${BASE_URL}/sets/card/${cardNumber}/`,
    `fetchCardByNumber(${cardNumber})`
  );
}

/** Fetch all available sets */
export async function fetchAllSets() {
  return safeFetch(`${BASE_URL}/allSets/`, "fetchAllSets");
}
