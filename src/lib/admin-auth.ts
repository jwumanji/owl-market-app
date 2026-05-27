const OWNER_ADMIN_EMAILS = new Set(["justin@tapnetwork.co"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedAdminEmail(email?: string | null) {
  const allowlist = process.env.ADMIN_EMAILS;
  const normalizedEmail = email ? normalizeEmail(email) : null;

  if (!normalizedEmail) return false;
  if (OWNER_ADMIN_EMAILS.has(normalizedEmail)) return true;
  if (!allowlist) return true;

  return allowlist
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(normalizedEmail);
}
