import { redis } from "./index";

/**
 * Lightweight cache wrapper around Upstash REST (was: ioredis TCP).
 *
 * ADR-0001: migrated from `ioredis` to `@upstash/redis` REST. Falls back
 * to `miss` behavior (calls fetcher) when Upstash env vars are unset.
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 60,
): Promise<T> {
  if (!redis) return fetcher();

  try {
    const cached = (await redis.get(key)) as string | null;
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Upstash error — fall through to fetcher
  }

  const value = await fetcher();

  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch {
    // Non-critical — value is already computed
  }

  return value;
}

/**
 * Invalidates cache keys by namespace.
 *
 * ADR-0001: Upstash REST has no efficient `KEYS pattern` + `DEL` equivalent.
 * Instead, each cache write appends the key to a per-namespace index key
 * (`__index__:<namespace>`). `cacheInvalidate` reads the index, deletes each
 * listed key, then deletes the index itself.
 *
 * Callers pass the same namespace string they used at write time (e.g.,
 * `cacheInvalidate("slots:doctor-1:2026-06-26")`).
 */
export async function cacheInvalidate(namespace: string): Promise<void> {
  if (!redis) return;

  const indexKey = `__index__:${namespace}`;

  try {
    const indexed = (await redis.get(indexKey)) as string[] | string | null;
    const keys: string[] = Array.isArray(indexed)
      ? indexed
      : typeof indexed === "string"
        ? [indexed]
        : [];

    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del(indexKey);
  } catch {
    // Non-critical
  }
}

/**
 * Helper for write-through index tracking. Internal — callers should not
 * invoke directly. Exported for tests.
 */
export async function _trackCacheKey(
  namespace: string,
  key: string,
): Promise<void> {
  if (!redis) return;
  const indexKey = `__index__:${namespace}`;
  try {
    await redis.rpush(indexKey, key);
    await redis.expire(indexKey, 86400); // index TTL = 24h
  } catch {
    // Non-critical
  }
}

/**
 * Idempotency helper for LiveKit webhook deliveries (livekit-webhooks, D4, AD-5).
 *
 * Uses Upstash `SET key value NX EX <ttl>` to atomically claim the event id.
 * Returns `{ isNew: true }` if this is the FIRST time the event id is seen
 * (caller proceeds with the side effect), or `{ isNew: false }` if the
 * event id was already claimed (caller no-ops, e.g. returns 200 OK to
 * LiveKit without re-running the dispatch).
 *
 * Degrades OPEN on Upstash unreachable: returns `{ isNew: true }` because
 * the state machine in `autoCompleteOnRoomFinishedUseCase` is itself
 * idempotent (terminal states are no-ops, the optimistic UPDATE catches
 * races). A degrade-CLOSED behavior would silently drop legitimate events
 * when Upstash is down, which is worse than a replay that re-runs the
 * side effect.
 *
 * @param eventId LiveKit's per-event UUID (every LiveKit event has a
 *                unique `id` field).
 * @param ttlSeconds TTL in seconds. Defaults to 86400 (24h). Events
 *                older than 24h are stale and can be silently dropped.
 */
export async function webhookDedupe(
  eventId: string,
  ttlSeconds: number = 86400,
): Promise<{ isNew: boolean }> {
  if (!redis) return { isNew: true }; // degrade-open
  try {
    // Upstash REST: set(key, value, { nx: true, ex: ttl }) returns "OK"
    // on first set, null if key already exists.
    const result = await redis.set(`livekit:webhook:${eventId}`, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    return { isNew: result === "OK" };
  } catch {
    return { isNew: true }; // degrade-open: error = treat as fresh
  }
}
