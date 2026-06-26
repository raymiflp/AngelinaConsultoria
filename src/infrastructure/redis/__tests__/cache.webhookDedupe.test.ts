import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test plan for `webhookDedupe` (livekit-webhooks, D4 / AD-5):
 *
 *   1. First call returns `{ isNew: true }` (redis.set returns "OK").
 *   2. Second call returns `{ isNew: false }` (redis.set returns null).
 *   3. Key shape is `livekit:webhook:<eventId>` (the namespace matches
 *      the existing `slots:` pattern in cache.ts).
 *   4. TTL of 86400 is passed via `ex` option by default.
 *   5. Degrade-open on Upstash throw returns `{ isNew: true }` (NOT
 *      `{ isNew: false }` — AD-5).
 *
 * ADR-0001: the underlying client migrated from `ioredis` to
 * `@upstash/redis` REST. The mock shape follows the Upstash REST SDK
 * (`redis.set(key, value, { nx: true, ex: ttl })`).
 *
 * The redis singleton is mocked via vi.mock on the module that exports it.
 * We use `vi.hoisted` so the spy is available inside the vi.mock factory
 * (which is hoisted above the test file's imports), matching the
 * `livekitServerClient` precedent in `livekit-server.test.ts`.
 */

const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    rpush: vi.fn(),
    expire: vi.fn(),
  };
  return { mockRedis };
});

vi.mock("@/infrastructure/redis", () => ({
  redis: mockRedis,
}));

// Import AFTER the mock is wired.
const { webhookDedupe } = await import("../cache");

beforeEach(() => {
  mockRedis.set.mockReset();
  mockRedis.get.mockReset();
  mockRedis.del.mockReset();
  mockRedis.rpush.mockReset();
  mockRedis.expire.mockReset();
});

describe("webhookDedupe", () => {
  it("first call returns { isNew: true } when redis.set returns 'OK'", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");

    const result = await webhookDedupe("evt-aaaa-bbbb");

    expect(result).toEqual({ isNew: true });
  });

  it("second call returns { isNew: false } when the key already exists", async () => {
    // Upstash REST SET ... NX returns null when the key already exists.
    mockRedis.set.mockResolvedValueOnce(null);

    const result = await webhookDedupe("evt-aaaa-bbbb");

    expect(result).toEqual({ isNew: false });
  });

  it("uses the key shape 'livekit:webhook:<eventId>' (namespaced)", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");

    await webhookDedupe("evt-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const callArgs = mockRedis.set.mock.calls[0]!;
    expect(callArgs[0]).toBe(
      "livekit:webhook:evt-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("passes TTL of 86400 (24h) by default via 'ex' option", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");

    await webhookDedupe("evt-aaaa-bbbb");

    const callArgs = mockRedis.set.mock.calls[0]!;
    // Upstash signature: set(key, value, { nx: true, ex: ttl })
    expect(callArgs[1]).toBe("1"); // value marker
    expect(callArgs[2]).toEqual({ nx: true, ex: 86400 });
  });

  it("degrade-open on Upstash throw returns { isNew: true } (NOT { isNew: false })", async () => {
    // AD-5: a degrade-CLOSED behavior would silently drop legitimate
    // events when Upstash is down, which is worse than a replay that
    // re-runs the use case (which is itself idempotent).
    mockRedis.set.mockRejectedValueOnce(new Error("connection refused"));

    const result = await webhookDedupe("evt-aaaa-bbbb");

    expect(result).toEqual({ isNew: true });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
