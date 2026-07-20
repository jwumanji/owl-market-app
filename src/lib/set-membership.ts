export type SetMembershipCard = {
  set_id: string | null;
};

export type SetMembershipMeta = {
  id: string;
  code: string | null;
};

export function buildDistributionSetCodeIndex(
  sets: readonly SetMembershipMeta[],
): ReadonlyMap<string, string> {
  const codeById = new Map<string, string>();

  for (const set of sets) {
    const code = set.code?.trim().toUpperCase();
    if (set.id && code) codeById.set(set.id, code);
  }

  return codeById;
}

export function distributionSetCode(
  card: SetMembershipCard,
  codeBySetId: ReadonlyMap<string, string>,
): string | null {
  if (!card.set_id) return null;
  return codeBySetId.get(card.set_id) ?? null;
}
