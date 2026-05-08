export function isAllowedAdminEmail(email?: string | null) {
  const allowlist = process.env.ADMIN_EMAILS;

  if (!email) return false;
  if (!allowlist) return true;

  return allowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
