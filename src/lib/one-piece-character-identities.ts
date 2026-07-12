import { normalizeCharacterMatchText } from "@/lib/character-card-matcher";

export type CanonicalCharacterIdentity = {
  canonicalName: string;
  aliases: string[];
};

// Printed identities that represent the same person should contribute to one
// character index. Keep this list deliberately limited to confirmed identities;
// forms such as the Seraphim remain separate characters.
export const ONE_PIECE_CHARACTER_IDENTITIES: CanonicalCharacterIdentity[] = [
  { canonicalName: "Monkey D. Luffy", aliases: ["Lucy"] },
  { canonicalName: "Nico Robin", aliases: ["Ms. All Sunday", "O-Robi"] },
  { canonicalName: "Usopp", aliases: ["Sogeking", "Uso-Hachi"] },
  { canonicalName: "Vinsmoke Sanji", aliases: ["San-Gorou", "Soba Mask"] },
  { canonicalName: "Franky", aliases: ["Fra-Nosuke"] },
  { canonicalName: "Tony Tony Chopper", aliases: ["Chopa-Emon", "Chopperman"] },
  { canonicalName: "Brook", aliases: ["Hone-Kichi"] },
  { canonicalName: "Killer", aliases: ["Hitokiri Kamazo"] },
  { canonicalName: "Charlotte Linlin", aliases: ["Olin"] },
  { canonicalName: "King", aliases: ["Alber"] },
  { canonicalName: "Caesar Clown", aliases: ["Gastino"] },
  { canonicalName: "Nefertari Vivi", aliases: ["Ms. Wednesday"] },
  { canonicalName: "Viola", aliases: ["Violet"] },
  { canonicalName: "Kouzuki Sukiyaki", aliases: ["Tenguyama Hitetsu"] },
  { canonicalName: "Kouzuki Toki", aliases: ["Amatsuki Toki"] },
  { canonicalName: "Kouzuki Oden", aliases: ["Kozuki Oden"] },
  { canonicalName: "Charlotte Lola", aliases: ["Lola"] },
  { canonicalName: "Nefertari Cobra", aliases: ["Nefeltari Cobra"] },
];

const IDENTITY_BY_PRINTED_NAME = new Map(
  ONE_PIECE_CHARACTER_IDENTITIES.flatMap((identity) =>
    [identity.canonicalName, ...identity.aliases].map((name) => [
      normalizeCharacterMatchText(name),
      identity,
    ] as const)
  )
);

export function canonicalOnePieceCharacterIdentity(name: string) {
  return IDENTITY_BY_PRINTED_NAME.get(normalizeCharacterMatchText(name)) ?? {
    canonicalName: name,
    aliases: [],
  };
}
