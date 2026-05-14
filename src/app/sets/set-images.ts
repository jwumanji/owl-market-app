// Maps a set slug → its box-art file in /public/sets/.
// Shared between the index thumbnail column and the detail page identity card.

export const SET_IMAGE_MAP: Record<string, string> = {
  op01: "op01.jpg", op02: "op02.jpg", op03: "op03.jpg", op04: "op04.jpg",
  op05: "op05.jpg", op06: "op06.jpg", op07: "op07.jpg", op08: "op08.jpg",
  op09: "op09.jpg", op10: "op10.jpg", op11: "op11.jpg", op12: "op12.jpg",
  op13: "op13.jpg", op14: "op14.jpg",
  eb01: "eb01.jpg",
  prb01: "prb01.jpg", prb02: "prb02.webp",
};

/** Resolve a slug like "op-13" or "OP13" or "op13" to its image file, or null. */
export function getSetImageFile(slug: string): string | null {
  if (!slug) return null;
  const key = slug.replace(/-/g, "").toLowerCase();
  return SET_IMAGE_MAP[key] ?? null;
}

/** Public URL for the box-art image, or null if no image is available. */
export function getSetImageUrl(slug: string): string | null {
  const file = getSetImageFile(slug);
  return file ? `/sets/${file}` : null;
}
