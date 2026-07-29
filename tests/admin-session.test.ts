import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("logout is a POST action that Next.js cannot prefetch", () => {
  const logoutRoute = readFileSync(
    new URL("../src/app/logout/route.ts", import.meta.url),
    "utf8",
  );
  const nav = readFileSync(
    new URL("../src/components/layout/Nav.tsx", import.meta.url),
    "utf8",
  );

  assert.match(logoutRoute, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(logoutRoute, /export async function GET/);
  assert.match(nav, /<form action="\/logout" method="post">/);
  assert.doesNotMatch(nav, /<Link href="\/logout"/);
});

test("market-name reviews send the session and recover expired logins", () => {
  const reviewQueue = readFileSync(
    new URL("../src/app/admin/market-names/MarketNameReviewQueue.tsx", import.meta.url),
    "utf8",
  );

  assert.match(reviewQueue, /credentials: "same-origin"/);
  assert.match(reviewQueue, /response\.status === 401/);
  assert.match(reviewQueue, /window\.location\.assign\(`\/login\?redirect=/);
});
