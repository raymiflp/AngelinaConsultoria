/**
 * Redis client singleton (Upstash REST).
 *
 * ADR-0001 (Vercel-Only): replaces the previous ioredis TCP client with
 * @upstash/redis REST. The REST API is zero-connection (no TCP handshake
 * on cold start) and survives Vercel Function recycling without orphaned
 * sockets.
 *
 * Only initializes when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * are set. When unset (local dev without Upstash, CI without secrets), all
 * operations are no-ops — the cache + rate-limiter modules degrade
 * gracefully (see cache.ts, rate-limiter.ts).
 */
import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = globalForRedis.redis ?? createRedis();
globalForRedis.redis = redis ?? undefined;

export { redis };
export default redis;
