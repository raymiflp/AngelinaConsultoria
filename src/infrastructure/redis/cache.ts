import { redis } from "./index";

/**
 * Lightweight cache wrapper around Redis.
 *
 * Falls back to `miss` behavior (calls fetcher) when Redis is unavailable.
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 60,
): Promise<T> {
  if (!redis) return fetcher();

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis error — fall through to fetcher
  }

  const value = await fetcher();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Non-critical — value is already computed
  }

  return value;
}

/**
 * Invalidates one or more cache keys by pattern.
 * E.g., `cacheInvalidate("slots:*")` to invalidate all slot caches.
 */
export async function cacheInvalidate(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Non-critical
  }
}

/**
 * Idempotency helper for LiveKit webhook deliveries (livekit-webhooks, D4, AD-5).
 *
 * Uses Redis `SET key value NX EX <ttl>` to atomically claim the event id.
 * Returns `{ isNew: true }` if this is the FIRST time the event id is seen
 * (caller proceeds with the side effect), or `{ isNew: false }` if the
 * event id was already claimed (caller no-ops, e.g. returns 200 OK to
 * LiveKit without re-running the dispatch).
 *
 * Degrades OPEN on Redis unreachable: returns `{ isNew: true }` because
 * the state machine in `autoCompleteOnRoomFinishedUseCase` is itself
 * idempotent (terminal states are no-ops, the optimistic UPDATE catches
 * races). A degrade-CLOSED behavior would silently drop legitimate events
 * when Redis is down, which is worse than a replay that re-runs the
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
  if (!redis) return { isNew: true }; // degrade-open: no Redis = treat as fresh
  try {
    // ioredis set signature: set(key, value, "EX", seconds, "NX")
    // returns "OK" on first set, null if key already exists.
    const result = await redis.set(
      `livekit:webhook:${eventId}`,
      "1",
      "EX",
      ttlSeconds,
      "NX",
    );
    return { isNew: result === "OK" };
  } catch {
    return { isNew: true }; // degrade-open: error = treat as fresh
  }
}
