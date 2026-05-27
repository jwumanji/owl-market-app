import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAdminEmail } from "../../src/lib/admin-auth";

const originalAdminEmails = process.env.ADMIN_EMAILS;

test.afterEach(() => {
  if (originalAdminEmails === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  }
});

test("owner admin email is allowed even when ADMIN_EMAILS is stale", () => {
  process.env.ADMIN_EMAILS = "ops@example.com";

  assert.equal(isAllowedAdminEmail("justin@tapnetwork.co"), true);
  assert.equal(isAllowedAdminEmail(" Justin@TapNetwork.co "), true);
});

test("ADMIN_EMAILS still gates non-owner accounts when configured", () => {
  process.env.ADMIN_EMAILS = "ops@example.com, admin@example.com";

  assert.equal(isAllowedAdminEmail("admin@example.com"), true);
  assert.equal(isAllowedAdminEmail("other@example.com"), false);
});
