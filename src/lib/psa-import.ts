import { GRADED_RATINGS, type GradedRating } from "@/lib/inventory-options";

export type PsaImportRow = {
  certificationNumber: string | null;
  cardName: string | null;
  cardNumber: string | null;
  setCode: string | null;
  gradeText: string | null;
  gradedRating: GradedRating | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  description: string | null;
  notes: string | null;
  sourceIndex: number;
};

export type CardLookupForImport = {
  id: string;
  name: string | null;
  card_number: string | null;
  sets: { code: string | null } | { code: string | null }[] | null;
};

const HEADER_ALIASES = {
  certificationNumber: [
    "certificationnumber",
    "certnumber",
    "cert",
    "certification",
    "certificationno",
    "certificationid",
    "psacert",
    "psacertnumber",
  ],
  cardName: ["cardname", "name", "player", "subject", "title", "itemname"],
  cardNumber: ["cardnumber", "cardno", "number", "no"],
  setCode: ["setcode", "set", "setid"],
  grade: [
    "grade",
    "numericgrade",
    "cardgrade",
    "finalgrade",
    "psagrade",
    "gradedescription",
    "gradegrade",
    "itemgrade",
    "gradevalue",
  ],
  frontImageUrl: [
    "frontimage",
    "frontimageurl",
    "frontscan",
    "frontscanurl",
    "fronturl",
    "obverse",
    "obverseimage",
    "obverseimageurl",
    "imagefront",
    "imagefronturl",
    "image1",
    "image1url",
  ],
  backImageUrl: [
    "backimage",
    "backimageurl",
    "backscan",
    "backscanurl",
    "backurl",
    "reverse",
    "reverseimage",
    "reverseimageurl",
    "imageback",
    "imagebackurl",
    "image2",
    "image2url",
  ],
  description: ["description", "itemdescription", "carddescription", "psadescription"],
  notes: ["notes", "note", "comments", "comment"],
} as const;

const GRADED_RATING_SET = new Set<string>(GRADED_RATINGS);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCardNumber(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function setCodeFromCardNumber(value: string | null | undefined) {
  const match = normalizeCardNumber(value).match(/^([A-Z]{1,4}\d{1,3})-/);
  return match?.[1] ?? null;
}

function isLikelyOnePieceCardNumber(value: string | null | undefined) {
  return /^(?:OP|EB|ST|PRB|P)\d{1,3}-\d{2,4}$/i.test(value ?? "");
}

function extractCardNumber(value: string | null | undefined) {
  const normalized = value ?? "";
  const match = normalized.match(/\b(?:OP|EB|ST|PRB|P)\d{1,3}-\d{2,4}\b/i);
  return match ? normalizeCardNumber(match[0]) : null;
}

function extractSetCode(value: string | null | undefined) {
  const normalized = value ?? "";
  const cardNumberSet = setCodeFromCardNumber(extractCardNumber(normalized));
  if (cardNumberSet) return cardNumberSet;

  const match = normalized.match(/\b(?:OP|EB|ST|PRB|P)\d{1,3}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function cleanCertNumber(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const digits = trimmed.match(/\d{5,}/)?.[0];
  return digits ?? trimmed;
}

function cleanUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function cleanCell(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function valueFor(row: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = cleanCell(row[alias]);
    if (value) return value;
  }
  return null;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => value.trim()));
}

export function normalizePsaGrade(value: string | null | undefined): GradedRating | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (/authentic/i.test(raw)) {
    return "PSA Authentic";
  }

  const numericMatch = raw.match(/\b(10|[1-9](?:\.5)?)\b/);
  if (!numericMatch) return null;

  const rating = `PSA ${numericMatch[1]}`.replace(".0", "");
  return GRADED_RATING_SET.has(rating) ? (rating as GradedRating) : null;
}

export function parsePsaImport(text: string): PsaImportRow[] {
  const [headers, ...records] = parseCsv(text);
  if (!headers || records.length === 0) return [];

  const normalizedHeaders = headers.map(normalizeHeader);

  return records.map((record, index) => {
    const row = normalizedHeaders.reduce<Record<string, string>>((acc, header, headerIndex) => {
      acc[header] = record[headerIndex] ?? "";
      return acc;
    }, {});

    const description = valueFor(row, HEADER_ALIASES.description);
    const rawCardNumber = valueFor(row, HEADER_ALIASES.cardNumber);
    const normalizedRawCardNumber = normalizeCardNumber(rawCardNumber);
    const cardNumber =
      extractCardNumber(rawCardNumber) ??
      extractCardNumber(description) ??
      (isLikelyOnePieceCardNumber(normalizedRawCardNumber) ? normalizedRawCardNumber : null);
    const rawSetCode = valueFor(row, HEADER_ALIASES.setCode);
    const setCode = extractSetCode(rawSetCode) ?? setCodeFromCardNumber(cardNumber) ?? extractSetCode(description);
    const gradeText = valueFor(row, HEADER_ALIASES.grade);
    const cardName = valueFor(row, HEADER_ALIASES.cardName) ?? description;
    const certificationNumber = cleanCertNumber(valueFor(row, HEADER_ALIASES.certificationNumber));
    const frontImageUrl = cleanUrl(valueFor(row, HEADER_ALIASES.frontImageUrl));
    const backImageUrl = cleanUrl(valueFor(row, HEADER_ALIASES.backImageUrl));
    const gradedRating = normalizePsaGrade(gradeText) ?? normalizePsaGrade(description);

    return {
      certificationNumber,
      cardName,
      cardNumber,
      setCode,
      gradeText,
      gradedRating,
      frontImageUrl,
      backImageUrl,
      description,
      notes: valueFor(row, HEADER_ALIASES.notes),
      sourceIndex: index,
    };
  });
}

export function matchInventoryCard(row: PsaImportRow, cards: CardLookupForImport[]) {
  const rowNumber = normalizeCardNumber(row.cardNumber);
  const rowSet = row.setCode?.toUpperCase() ?? null;
  const rowName = normalizeText(row.cardName);

  if (rowNumber && rowSet) {
    const exactNumberMatches = cards.filter((card) => normalizeCardNumber(card.card_number) === rowNumber);
    const setMatch = exactNumberMatches.find((card) => {
      const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
      return rowSet && set?.code?.toUpperCase() === rowSet;
    });
    if (setMatch) return setMatch;
  }

  if (rowName) {
    const nameMatches = cards.filter((card) => normalizeText(card.name) === rowName);
    if (rowSet) {
      const setMatch = nameMatches.find((card) => {
        const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
        return set?.code?.toUpperCase() === rowSet;
      });
      if (setMatch) return setMatch;
    }

    if (rowNumber) {
      const numberMatch = nameMatches.find((card) => normalizeCardNumber(card.card_number) === rowNumber);
      if (numberMatch) return numberMatch;
    }

    if (!rowSet && !rowNumber && nameMatches.length === 1) return nameMatches[0];
  }

  return null;
}
