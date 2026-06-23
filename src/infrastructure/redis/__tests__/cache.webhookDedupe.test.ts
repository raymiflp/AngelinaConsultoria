import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test plan for `webhookDedupe` (livekit-webhooks, D4 / AD-5):
 *
 *   1. First call returns `{ isNew: true }` (redis.set returns "OK").
 *   2. Second call returns `{ isNew: false }` (redis.set returns null).
 *   3. Key shape is `livekit:webhook:<eventId>` (the namespace matches
 *      the existing `slots:` pattern in cache.ts).
 *   4. TTL of 86400 is passed via "EX" by default.
 *   5. Degrade-open on Redis throw returns `{ isNew: true }` (NOT
 *      `{ isNew: false }` — AD-5).
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
    keys: vi.fn(),
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
  mockRedis.keys.mockReset();
});

describe("webhookDedupe", () => {
  it("first call returns { isNew: true } when redis.set returns 'OK'", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");

    const result = await webhookDedupe("evt-aaaa-bbbb");

    expect(result).toEqual({ isNew: true });
  });

  it("second call returns { isNew: false } when the key already exists", async () => {
    // ioredis SET ... NX returns null when the key already exists.
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

  it("passes TTL of 86400 (24h) by default via 'EX' option", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");

    await webhookDedupe("evt-aaaa-bbbb");

    const callArgs = mockRedis.set.mock.calls[0]!;
    // ioredis signature: set(key, value, "EX", seconds, "NX")
    expect(callArgs[1]).toBe("1"); // value marker
    expect(callArgs[2]).toBe("EX");
    expect(callArgs[3]).toBe(86400);
    expect(callArgs[4]).toBe("NX");
  });

  it("degrade-open on Redis throw returns { isNew: true } (NOT { isNew: false })", async () => {
    // AD-5: a degrade-CLOSED behavior would silently drop legitimate
    // events when Redis is down, which is worse than a replay that
    // re-runs the use case (which is itself idempotent).
    mockRedis.set.mockRejectedValueOnce(new Error("connection refused"));

    const result = await webhookDedupe("evt-aaaa-bbbb");

    expect(result).toEqual({ isNew: true });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});