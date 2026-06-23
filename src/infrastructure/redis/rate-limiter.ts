import { TRPCError } from "@trpc/server";
import { redis } from "./index";

/**
 * Sliding window rate limiter.
 *
 * Tracks request frequency by key (e.g. `userId` or `ip` + procedure path)
 * and rejects if the count exceeds `maxRequests` within `windowMs`.
 *
 * Falls back to no-op when Redis is unavailable.
 */
export async function rateLimit(options: {
  key: string;
  maxRequests: number;
  windowMs: number;
}): Promise<void> {
  if (!redis) return; // Redis unavailable — skip rate limiting

  const { key, maxRequests, windowMs } = options;
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;

  try {
    const multi = redis.multi();
    multi.zremrangebyscore(windowKey, 0, now - windowMs);
    multi.zadd(windowKey, now, `${now}-${Math.random()}`);
    multi.zcard(windowKey);
    multi.expire(windowKey, Math.ceil(windowMs / 1000));
    const results = await multi.exec();

    // zcard result is at index 2: [error, count]
    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > maxRequests) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Demasiadas solicitudes. Intentalo de nuevo más tarde.",
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    // Redis error — allow through (degraded, not blocked)
    console.warn("[RateLimit] Redis error:", err);
  }
}
