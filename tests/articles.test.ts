import assert from "node:assert/strict";
import test from "node:test";

import {
  articleReadMinutes,
  formatArticleDate,
  slugifyArticleTitle,
} from "../src/lib/articles.ts";

test("article slugs are URL-safe and stable", () => {
  assert.equal(
    slugifyArticleTitle("Round 2 cards revealed — Secret Rare!"),
    "round-2-cards-revealed-secret-rare",
  );
  assert.equal(slugifyArticleTitle("  OP-16 / First Look  "), "op-16-first-look");
});

test("article dates format chronologically in UTC", () => {
  assert.equal(formatArticleDate("2026-07-14T23:30:00Z"), "Jul 14, 2026");
  assert.equal(formatArticleDate(null), "Unscheduled");
});

test("reading time has a one-minute minimum and rounds up", () => {
  assert.equal(articleReadMinutes("A short story."), 1);
  assert.equal(articleReadMinutes(Array.from({ length: 221 }, () => "word").join(" ")), 2);
});
