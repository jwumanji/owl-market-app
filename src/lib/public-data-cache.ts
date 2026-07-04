import { unstable_cache } from "next/cache";

export const PUBLIC_DATA_CACHE_TTL_SECONDS = 300;

// TTLs matched to data cadence (M2): catalog shape changes ~weekly, prices
// sync 4x/day — neither needs 5-minute regeneration.
export const CATALOG_DATA_TTL_SECONDS = 3600;
export const PRICE_DATA_TTL_SECONDS = 900;

export const PUBLIC_DATA_CACHE_HEADERS = {
  "Cache-Control": `public, max-age=60, s-maxage=${PUBLIC_DATA_CACHE_TTL_SECONDS}, stale-while-revalidate=${PUBLIC_DATA_CACHE_TTL_SECONDS * 3}`,
};

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const publicDataCache = new Map<string, CacheEntry<unknown>>();

function normalizeKeyPart(part: unknown): string {
  if (part == null) return "";
  return encodeURIComponent(String(part));
}

export function publicDataCacheKey(scope: string, ...parts: unknown[]): string {
  return [scope, ...parts.map(normalizeKeyPart)].join(":");
}

export function cachedPublicData<T>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds = PUBLIC_DATA_CACHE_TTL_SECONDS
): Promise<T> {
  const now = Date.now();
  const cached = publicDataCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.promise;

  const loadWithNextCache = unstable_cache(load, ["public-data", key], {
    revalidate: ttlSeconds,
  });
  const promise = Promise.resolve()
    .then(loadWithNextCache)
    .catch((error) => {
      if (publicDataCache.get(key)?.promise === promise) {
        publicDataCache.delete(key);
      }
      throw error;
    });

  publicDataCache.set(key, {
    expiresAt: now + ttlSeconds * 1000,
    promise,
  });

  return promise;
}
