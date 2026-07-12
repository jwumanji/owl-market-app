export type CharacterMatchSource = {
  id: string;
  name: string;
  aliases?: string[] | null;
};

export type CharacterMatchPattern = {
  characterId: string;
  normalizedPattern: string;
  sourcePattern: string;
};

export type CharacterCardMatch = {
  characterId: string;
  matchedName: string;
  matchedPattern: string;
};

const EXCLUSIONS: Record<string, string[]> = {
  roger: ["jolly roger"],
  king: [
    "dragon king",
    "flame dragon king",
    "king bazooka",
    "king cobra",
    "king kong",
    "king of pirates",
    "king of the pirates",
    "king pistol",
    "king punch",
  ],
  dragon: [
    "dragon breath",
    "dragon claw",
    "dragon damnation",
    "dragon king",
    "dragon seal",
    "dragon twister",
    "flame dragon",
  ],
};

export function normalizeCharacterMatchText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u2019\u0027]s(?=\s|$)/gi, "")
    .replace(/[\u2019\u0027]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cleanCharacterCardMatchName(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s*\[(?:winner)\]\s*$/i, "")
    .replace(/\s+-\s+(?:OP|EB|ST|PRB|P)\d{2}-\d{3}\s*$/i, "")
    .replace(/(?:\s+\([^)]*\))+\s*$/g, "")
    .trim();
}

export function splitCharacterCardNames(value: string | null | undefined) {
  return cleanCharacterCardMatchName(value)
    .split(/\s+&\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function containsWholePhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}

function isExcluded(pattern: string, cardName: string) {
  return (EXCLUSIONS[pattern] ?? []).some((phrase) => containsWholePhrase(cardName, phrase));
}

export function buildCharacterMatchPatterns(characters: CharacterMatchSource[]): CharacterMatchPattern[] {
  const unique = new Map<string, CharacterMatchPattern>();

  for (const character of characters) {
    for (const sourcePattern of [character.name, ...(character.aliases ?? [])]) {
      const normalizedPattern = normalizeCharacterMatchText(sourcePattern);
      if (!normalizedPattern) continue;
      const key = `${character.id}|${normalizedPattern}`;
      if (!unique.has(key)) {
        unique.set(key, { characterId: character.id, normalizedPattern, sourcePattern });
      }
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) =>
      b.normalizedPattern.length - a.normalizedPattern.length ||
      a.normalizedPattern.localeCompare(b.normalizedPattern)
  );
}

export function findCardCharacterMatches(
  card: { name: string | null | undefined; name_base?: string | null; card_type?: string | null },
  patterns: CharacterMatchPattern[]
): CharacterCardMatch[] {
  // Marketplace titles often append collection or distribution labels such as
  // "Judge", "Uta Collection", or "Winner". When a clean base name exists it
  // is authoritative; falling through to the decorated title can map the card
  // to a character mentioned only by that label.
  const preferredName = cleanCharacterCardMatchName(card.name_base?.trim() || card.name);
  const names = [normalizeCharacterMatchText(preferredName)].filter(Boolean);
  if (card.card_type && !/^(character|leader)$/i.test(card.card_type)) return [];

  // Character and Leader cards use their printed identity (or identities) as
  // the source of truth. Exact part matching prevents common names such as
  // King, Queen, Speed, or Rock from leaking into unrelated event titles.
  const exactMatches = new Map<string, CharacterCardMatch>();
  for (const printedName of splitCharacterCardNames(preferredName)) {
    const normalizedPrintedName = normalizeCharacterMatchText(printedName);
    for (const pattern of patterns) {
      if (pattern.normalizedPattern !== normalizedPrintedName) continue;
      if (!exactMatches.has(pattern.characterId)) {
        exactMatches.set(pattern.characterId, {
          characterId: pattern.characterId,
          matchedName: normalizedPrintedName,
          matchedPattern: pattern.sourcePattern,
        });
      }
    }
  }
  if (exactMatches.size > 0) return Array.from(exactMatches.values());

  const matches = new Map<string, CharacterCardMatch>();

  for (const pattern of patterns) {
    const matchedName = names.find(
      (name) =>
        containsWholePhrase(name, pattern.normalizedPattern) &&
        !isExcluded(pattern.normalizedPattern, name)
    );
    if (matchedName && !matches.has(pattern.characterId)) {
      matches.set(pattern.characterId, {
        characterId: pattern.characterId,
        matchedName,
        matchedPattern: pattern.sourcePattern,
      });
    }
  }

  return Array.from(matches.values());
}

export function matchCardToCharacter(
  card: { name: string | null | undefined; name_base?: string | null; card_type?: string | null },
  patterns: CharacterMatchPattern[]
) {
  return findCardCharacterMatches(card, patterns)[0] ?? null;
}
