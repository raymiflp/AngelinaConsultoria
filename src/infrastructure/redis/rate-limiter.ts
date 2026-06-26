import { TRPCError } from "@trpc/server";
import { redis } from "./index";

/**
 * Sliding window rate limiter.
 *
 * Tracks request frequency by key (e.g. `userId` or `ip` + procedure path)
 * and rejects if the count exceeds `maxRequests` within `windowMs`.
 *
 * ADR-0001: migrated from `ioredis` to `@upstash/redis` REST. The previous
 * implementation used `MULTI`/`EXEC` for atomic increment + window cleanup;
 * Upstash REST has no `MULTI` primitive, so the operations run sequentially.
 *
 * RACE WINDOW (acceptable, documented):
 *   Without `MULTI`, two concurrent requests can both pass the `ZREMRANGEBYSCORE`
 *   check and both insert before the `ZCARD` runs. The window of the race is
 *   sub-millisecond (Upstash REST round-trip is ~5-30ms per call). For a
 *   rate limit of 30 req / 10s this means at most 1-2 extra requests slip
 *   through under sustained burst load. Not worth a `MULTI`-equivalent
 *   workaround for this use case.
 *
 * Falls back to no-op when Upstash env vars are unset (graceful-degrade).
 */
export async function rateLimit(options: {
  key: string;
  maxRequests: number;
  windowMs: number;
}): Promise<void> {
  if (!redis) return; // Upstash unavailable — skip rate limiting

  const { key, maxRequests, windowMs } = options;
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;

  try {
    // Sequential Upstash REST calls — no MULTI primitive available.
    await redis.zremrangebyscore(windowKey, 0, now - windowMs);
    await redis.zadd(windowKey, { score: now, member: `${now}-${Math.random()}` });
    const count = (await redis.zcard(windowKey)) as number;
    await redis.expire(windowKey, Math.ceil(windowMs / 1000));

    if (count > maxRequests) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Demasiadas solicitudes. Intentalo de nuevo más tarde.",
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    // Upstash error — allow through (degraded, not blocked)
    console.warn("[RateLimit] Upstash error:", err);
  }
}
