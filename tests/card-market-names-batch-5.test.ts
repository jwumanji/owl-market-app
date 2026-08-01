import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("fifth curation batch adds gold leaders, manga variants, and wanted posters without auto-approval", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260730220000_card_market_names_batch_5.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'OP05-022_sp_eb02', 'Gold Rosinante Leader'/);
  assert.match(migration, /'OP07-019_sp_eb02', 'Gold Bonney Leader'/);
  assert.match(migration, /'EB04-044_p2', 'Manga Koby'/);
  assert.match(migration, /'OP03-122_r1', 'PRB01 Manga Sogeking'/);
  assert.match(migration, /'OP05-119_p6', 'OP09 Wanted Poster Luffy'/);
  assert.match(migration, /'OP13-118_p4', 'OP13 Wanted Poster Luffy'/);
  assert.match(migration, /'OP09-093_p3', 'Wanted Poster Blackbeard'/);
  assert.match(migration, /'P-OP11-041', 'Whole Cake Nami'/);
  assert.match(migration, /'OP09-051-anniversary-set', '2nd Anniversary Buggy'/);
  assert.doesNotMatch(migration, /status\s*[,)]/i);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
});
