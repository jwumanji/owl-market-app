import SetsClient from "./SetsClient";
import { loadSets } from "./load-sets";
import { SETS as FALLBACK_SETS, type SetData } from "./sets-data";

export const dynamic = "force-dynamic";

const PINNED_FALLBACK_CODES = new Set(["EB04"]);

function withPinnedFallbackSets(sets: SetData[]): SetData[] {
  const existingCodes = new Set(sets.map((set) => set.code.toUpperCase()));
  const missingPinned = FALLBACK_SETS.filter(
    (set) => PINNED_FALLBACK_CODES.has(set.code.toUpperCase()) && !existingCodes.has(set.code.toUpperCase())
  );

  return missingPinned.length > 0 ? [...sets, ...missingPinned] : sets;
}

export default async function SetsPage() {
  let initialSets: SetData[];
  try {
    const data = await loadSets();
    const loadedSets = data.sets as unknown as SetData[];
    initialSets = loadedSets.length > 0
      ? withPinnedFallbackSets(loadedSets)
      : FALLBACK_SETS;
  } catch {
    initialSets = FALLBACK_SETS;
  }
  return <SetsClient initialSets={initialSets} />;
}
