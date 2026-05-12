import SetsClient from "./SetsClient";
import { loadSets } from "./load-sets";
import { SETS as FALLBACK_SETS, type SetData } from "./sets-data";

export const dynamic = "force-dynamic";

export default async function SetsPage() {
  let initialSets: SetData[];
  try {
    const data = await loadSets();
    const loadedSets = data.sets as unknown as SetData[];
    initialSets = loadedSets.length > 0
      ? loadedSets
      : FALLBACK_SETS;
  } catch {
    initialSets = FALLBACK_SETS;
  }
  return <SetsClient initialSets={initialSets} />;
}
