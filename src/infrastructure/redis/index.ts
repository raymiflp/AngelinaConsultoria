/**
 * Redis client singleton.
 *
 * Only initializes when REDIS_URL is set (production/preview).
 * In development/CI without Redis, all operations are no-ops.
 */
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const REDIS_URL = process.env.REDIS_URL;

function createRedis(): Redis | null {
  if (!REDIS_URL) return null;
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    console.warn("[Redis] Connection error:", err.message);
  });

  return client;
}

const redis = globalForRedis.redis ?? createRedis();
globalForRedis.redis = redis ?? undefined;

export { redis };
export default redis;
