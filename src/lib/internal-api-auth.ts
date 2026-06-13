type InternalAuthOptions = {
  queryParam?: string;
  secretNames?: string[];
};

type InternalAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function configuredSecret(secretNames: string[]) {
  for (const name of secretNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function authorizeInternalRequest(
  request: Request,
  { queryParam = "token", secretNames = ["SYNC_SECRET", "CRON_SECRET"] }: InternalAuthOptions = {}
): InternalAuthResult {
  const secret = configuredSecret(secretNames);

  if (!secret) {
    return { ok: false, status: 500, error: `${secretNames.join(" or ")} is not set` };
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get(queryParam);
  const isAuthorized =
    request.headers.get("authorization") === `Bearer ${secret}` ||
    token === secret;

  return isAuthorized ? { ok: true } : { ok: false, status: 401, error: "Unauthorized" };
}
