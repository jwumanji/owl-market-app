import { ONE_PIECE_CHARACTER_IDENTITIES } from "@/lib/one-piece-character-identities";

type SearchableCharacter = {
  name: string;
  faction?: string | null;
};

const SEARCH_ALIASES = new Map(
  ONE_PIECE_CHARACTER_IDENTITIES.map((identity) => [
    identity.canonicalName.toLowerCase(),
    identity.aliases.map((alias) => alias.toLowerCase()),
  ])
);

export function characterMatchesSearch(character: SearchableCharacter, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return (
    character.name.toLowerCase().includes(normalizedQuery) ||
    character.faction?.toLowerCase().includes(normalizedQuery) ||
    (SEARCH_ALIASES.get(character.name.toLowerCase()) ?? []).some((alias) =>
      alias.includes(normalizedQuery)
    )
  );
}
