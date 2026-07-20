export const PROVIDER_SYNC_STATE_CONFLICT =
  "game_id,catalog_scope,provider,provider_api_version,job_key,scope_key";

export interface ProviderSyncScope {
  gameId: string;
  provider: string;
  jobKey: string;
  scopeKey?: string;
  catalogScope?: string;
  providerApiVersion?: string;
  legacyKey?: string;
}

export interface ProviderSyncStateRow<TState> {
  state: TState;
  locked_at: string | null;
  lock_owner: string | null;
}

interface ProviderSyncStateResult<TState> {
  row: ProviderSyncStateRow<TState> | null;
  source: "scoped" | "legacy" | "empty";
  error?: string;
}

export interface AcquireProviderSyncStateResult<TState> {
  state: TState;
  lockOwner: string | null;
  locked: boolean;
  row?: { locked_at?: string | null };
  error?: Record<string, unknown>;
  status?: number;
}

// Supabase's generated database types do not include migrations that have not
// been deployed yet. Keep this compatibility helper structural so code can ship
// before or after the additive migration without regenerating the whole schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

function scopeValues(scope: ProviderSyncScope) {
  return {
    game_id: scope.gameId,
    catalog_scope: scope.catalogScope ?? "",
    provider: scope.provider,
    provider_api_version: scope.providerApiVersion ?? "",
    job_key: scope.jobKey,
    scope_key: scope.scopeKey ?? "",
    legacy_key: scope.legacyKey ?? null,
  };
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined, table: string) {
  const message = error?.message?.toLowerCase() ?? "";
  const namesTable = message.includes(table.toLowerCase());
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (namesTable && (message.includes("does not exist") || message.includes("could not find")))
  );
}

async function readLegacyState<TState>(
  supabase: SupabaseLike,
  legacyKey: string | undefined
): Promise<ProviderSyncStateResult<TState>> {
  if (!legacyKey) return { row: null, source: "empty" };
  const { data, error } = await supabase
    .from("sync_state")
    .select("state,locked_at,lock_owner")
    .eq("key", legacyKey)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error, "sync_state")) {
      return { row: null, source: "empty", error: "Missing provider_sync_states and sync_state tables." };
    }
    return { row: null, source: "empty", error: error.message ?? "sync_state read failed" };
  }
  if (!data) return { row: null, source: "empty" };
  return {
    row: {
      state: (data.state ?? {}) as TState,
      locked_at: data.locked_at ?? null,
      lock_owner: data.lock_owner ?? null,
    },
    source: "legacy",
  };
}

export async function readProviderSyncState<TState>(
  supabase: SupabaseLike,
  scope: ProviderSyncScope
): Promise<ProviderSyncStateResult<TState>> {
  const values = scopeValues(scope);
  const { data, error } = await supabase
    .from("provider_sync_states")
    .select("state,locked_at,lock_owner")
    .eq("game_id", values.game_id)
    .eq("catalog_scope", values.catalog_scope)
    .eq("provider", values.provider)
    .eq("provider_api_version", values.provider_api_version)
    .eq("job_key", values.job_key)
    .eq("scope_key", values.scope_key)
    .maybeSingle();

  if (error && !isMissingRelation(error, "provider_sync_states")) {
    return {
      row: null,
      source: "empty",
      error: error.message ?? "provider_sync_states read failed",
    };
  }

  if (data) {
    return {
      row: {
        state: (data.state ?? {}) as TState,
        locked_at: data.locked_at ?? null,
        lock_owner: data.lock_owner ?? null,
      },
      source: "scoped",
    };
  }

  return readLegacyState<TState>(supabase, scope.legacyKey);
}

async function writeLegacyState<TState>(
  supabase: SupabaseLike,
  legacyKey: string | undefined,
  state: TState,
  lock: { lockedAt: string | null; lockOwner: string | null }
): Promise<string | null> {
  if (!legacyKey) return null;
  const now = new Date().toISOString();
  const { error } = await supabase.from("sync_state").upsert(
    {
      key: legacyKey,
      state,
      locked_at: lock.lockedAt,
      lock_owner: lock.lockOwner,
      updated_at: now,
    },
    { onConflict: "key" }
  );
  if (error && !isMissingRelation(error, "sync_state")) {
    return error.message ?? "sync_state write failed";
  }
  return null;
}

export async function writeProviderSyncState<TState>(
  supabase: SupabaseLike,
  scope: ProviderSyncScope,
  state: TState,
  lock: { lockedAt?: string | null; lockOwner?: string | null } = {}
): Promise<string | null> {
  const now = new Date().toISOString();
  const values = scopeValues(scope);
  const lockedAt = lock.lockedAt ?? null;
  const lockOwner = lock.lockOwner ?? null;
  const { error } = await supabase.from("provider_sync_states").upsert(
    {
      ...values,
      state,
      locked_at: lockedAt,
      lock_owner: lockOwner,
      updated_at: now,
    },
    { onConflict: PROVIDER_SYNC_STATE_CONFLICT }
  );

  if (error && !isMissingRelation(error, "provider_sync_states")) {
    return error.message ?? "provider_sync_states write failed";
  }

  // Dual-write the old cursor during the rollback window. If the scoped table
  // is not deployed yet this also acts as the production fallback.
  return writeLegacyState(supabase, scope.legacyKey, state, { lockedAt, lockOwner });
}

export async function acquireProviderSyncState<TState>(options: {
  supabase: SupabaseLike;
  scope: ProviderSyncScope;
  lockTtlMs: number;
  reset: boolean;
  resetState: () => TState;
  normalizeState: (existing: TState) => TState;
}): Promise<AcquireProviderSyncStateResult<TState>> {
  const current = await readProviderSyncState<TState>(options.supabase, options.scope);
  if (current.error) {
    return {
      state: options.resetState(),
      lockOwner: null,
      locked: false,
      status: 500,
      error: { error: current.error },
    };
  }

  const lockedAtMs = current.row?.locked_at ? Date.parse(current.row.locked_at) : Number.NaN;
  if (
    current.row?.lock_owner &&
    Number.isFinite(lockedAtMs) &&
    Date.now() - lockedAtMs < options.lockTtlMs
  ) {
    return {
      state: current.row.state,
      lockOwner: null,
      locked: true,
      row: { locked_at: current.row.locked_at },
    };
  }

  const state = options.reset || !current.row
    ? options.resetState()
    : options.normalizeState(current.row.state);
  const lockOwner = globalThis.crypto.randomUUID();
  const lockedAt = new Date().toISOString();
  const error = await writeProviderSyncState(options.supabase, options.scope, state, {
    lockedAt,
    lockOwner,
  });
  if (error) {
    return {
      state,
      lockOwner: null,
      locked: false,
      status: 500,
      error: { error },
    };
  }
  return { state, lockOwner, locked: false };
}

export async function releaseProviderSyncState<TState>(options: {
  supabase: SupabaseLike;
  scope: ProviderSyncScope;
  lockOwner: string;
  state: TState;
}): Promise<string | null> {
  const values = scopeValues(options.scope);
  const now = new Date().toISOString();
  const { error } = await options.supabase
    .from("provider_sync_states")
    .update({
      state: options.state,
      locked_at: null,
      lock_owner: null,
      updated_at: now,
    })
    .eq("game_id", values.game_id)
    .eq("catalog_scope", values.catalog_scope)
    .eq("provider", values.provider)
    .eq("provider_api_version", values.provider_api_version)
    .eq("job_key", values.job_key)
    .eq("scope_key", values.scope_key)
    .eq("lock_owner", options.lockOwner);

  if (error && !isMissingRelation(error, "provider_sync_states")) {
    return error.message ?? "provider_sync_states release failed";
  }

  // The legacy update intentionally checks lock_owner so an expired worker
  // cannot clear a newer worker's lock during the compatibility window.
  if (options.scope.legacyKey) {
    const legacyResult = await options.supabase
      .from("sync_state")
      .update({
        state: options.state,
        locked_at: null,
        lock_owner: null,
        updated_at: now,
      })
      .eq("key", options.scope.legacyKey)
      .eq("lock_owner", options.lockOwner);
    if (legacyResult.error && !isMissingRelation(legacyResult.error, "sync_state")) {
      return legacyResult.error.message ?? "sync_state release failed";
    }
  }
  return null;
}
