import SetsClient from "./SetsClient";
import { loadSets } from "./load-sets";
import { SETS as FALLBACK_SETS, type SetData } from "./sets-data";

export const dynamic = "force-dynamic";

export default async function SetsPage() {
  let initialSets: SetData[];
  try {
    const data = await loadSets();
    initialSets = (data.sets as unknown as SetData[]).length > 0
      ? (data.sets as unknown as SetData[])
      : FALLBACK_SETS;
  } catch {
    initialSets = FALLBACK_SETS;
  }
  return <SetsClient initialSets={initialSets} />;
}
