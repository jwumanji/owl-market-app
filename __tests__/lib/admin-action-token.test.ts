import assert from "node:assert/strict";
import test from "node:test";
import {
  CENTERING_MEASURE_ACTION,
  createAdminActionToken,
  verifyAdminActionToken,
} from "../../src/lib/admin-action-token";

test.beforeEach(() => {
  process.env.ADMIN_ACTION_SECRET = "test-admin-action-secret";
});

test.afterEach(() => {
  delete process.env.ADMIN_ACTION_SECRET;
});

test("admin action token verifies for the intended action", () => {
  const token = createAdminActionToken({
    user: { id: "admin-user-1", email: "admin@example.com" },
    action: CENTERING_MEASURE_ACTION,
  });

  const result = verifyAdminActionToken(token, CENTERING_MEASURE_ACTION);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.user, { id: "admin-user-1", email: "admin@example.com" });
  }
});

test("admin action token rejects the wrong action and expired tokens", () => {
  const wrongActionToken = createAdminActionToken({
    user: { id: "admin-user-1", email: "admin@example.com" },
    action: CENTERING_MEASURE_ACTION,
  });
  const expiredToken = createAdminActionToken({
    user: { id: "admin-user-1", email: "admin@example.com" },
    action: CENTERING_MEASURE_ACTION,
    ttlSeconds: -1,
  });

  assert.deepEqual(verifyAdminActionToken(wrongActionToken, "other-action"), {
    ok: false,
    reason: "wrong-action",
  });
  assert.deepEqual(verifyAdminActionToken(expiredToken, CENTERING_MEASURE_ACTION), {
    ok: false,
    reason: "expired",
  });
});
