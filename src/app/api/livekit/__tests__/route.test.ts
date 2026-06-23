import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { WebhookEvent } from "livekit-server-sdk";

/**
 * Test plan for `POST /api/livekit/webhook` (livekit-webhooks, D1/D2/D3):
 *
 *   1. Valid signature → 200 + dispatch called with the parsed event.
 *   2. Invalid signature → 401; no dedupe, no dispatch.
 *   3. Dedupe hit → 200 `{ deduped: true }`; no dispatch.
 *   4. Dedupe miss + room_finished → dispatch called.
 *   5. Dispatch called with the correct event payload.
 *
 * The route handler depends on three side effects:
 *   - `livekitServerClient.verifyWebhook` (the SDK wrapper)
 *   - `webhookDedupe` (the Redis-backed idempotency helper)
 *   - `autoCompleteOnRoomFinishedUseCase` (the domain use case)
 *
 * We mock all three via `vi.mock(...)` so the route handler test does
 * NOT need a running LiveKit container or a Redis instance (R10
 * mitigation). The CI environment runs the full vitest suite in <30s.
 */

// ── Hoisted mocks (visible inside the vi.mock factories) ────────────────

const { mockVerifyWebhook, mockWebhookDedupe, mockAutoComplete } =
  vi.hoisted(() => ({
    mockVerifyWebhook: vi.fn(),
    mockWebhookDedupe: vi.fn(),
    mockAutoComplete: vi.fn(),
  }));

vi.mock("@/infrastructure/livekit/livekit-server", () => ({
  livekitServerClient: {
    verifyWebhook: mockVerifyWebhook,
  },
}));

vi.mock("@/infrastructure/redis/cache", () => ({
  webhookDedupe: (...args: unknown[]) =>
    (mockWebhookDedupe as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/application", () => ({
  autoCompleteOnRoomFinishedUseCase: (...args: unknown[]) =>
    (mockAutoComplete as unknown as (...a: unknown[]) => unknown)(...args),
}));

// The route handler imports `db` from `@/infrastructure/db` at module
// load time, and `db/index.ts` throws if DATABASE_URL is unset. In the
// unit-test env there's no DATABASE_URL — substitute a no-op stub that
// the mocked use case ignores (the route handler passes the stub `db`
// through to the use case, which is itself mocked).
vi.mock("@/infrastructure/db", () => ({
  db: { __stub: "no-DB-in-unit-tests" },
}));

// Import AFTER mocks are wired.
const { POST } = await import("../webhook/route");

// ── Fixtures ────────────────────────────────────────────────────────────

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const EVENT_ID = "evt-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ROOM_NAME = `cita-${CITA_ID}`;

function makeRoomFinishedEvent(
  overrides: Partial<{ numParticipants: number }> = {},
): WebhookEvent {
  const np = overrides.numParticipants ?? 1;
  return {
    event: "room_finished",
    id: EVENT_ID,
    room: {
      name: ROOM_NAME,
      num_participants: np,
      numParticipants: np,
    },
  } as unknown as WebhookEvent;
}

function makeRequest(body: string, authHeader?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authHeader !== undefined) {
    headers["authorization"] = authHeader;
  }
  return new Request("http://localhost:3000/api/livekit/webhook", {
    method: "POST",
    headers,
    body,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("POST /api/livekit/webhook", () => {
  beforeEach(() => {
    mockVerifyWebhook.mockReset();
    mockWebhookDedupe.mockReset();
    mockAutoComplete.mockReset();
    // Default wiring: valid signature, fresh event, use case succeeds.
    mockVerifyWebhook.mockResolvedValue(makeRoomFinishedEvent());
    mockWebhookDedupe.mockResolvedValue({ isNew: true });
    mockAutoComplete.mockResolvedValue({
      citaId: CITA_ID,
      finalState: "COMPLETADA",
      transitioned: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Scenario 1: valid signature → 200 + dispatch ────────────────────

  it("returns 200 and calls dispatch when the signature is valid + dedupe miss + room_finished", async () => {
    const body = JSON.stringify({
      event: "room_finished",
      id: EVENT_ID,
      room: { name: ROOM_NAME, num_participants: 1 },
    });
    const req = makeRequest(body, "Bearer jwt-valid");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, transitioned: true });
    expect(mockVerifyWebhook).toHaveBeenCalledTimes(1);
    expect(mockWebhookDedupe).toHaveBeenCalledTimes(1);
    expect(mockAutoComplete).toHaveBeenCalledTimes(1);
  });

  // ── Scenario 2: invalid signature → 401, no dispatch ────────────────

  it("returns 401 when the signature is invalid (verifyWebhook throws); does NOT dedupe or dispatch", async () => {
    mockVerifyWebhook.mockRejectedValueOnce(
      new Error("sha256 checksum of body does not match"),
    );
    const body = JSON.stringify({ event: "room_finished" });
    const req = makeRequest(body, "Bearer jwt-bogus");

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    // The trust boundary holds — dedupe and dispatch are skipped on 401.
    expect(mockWebhookDedupe).not.toHaveBeenCalled();
    expect(mockAutoComplete).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing (SDK throws 'authorization header is empty')", async () => {
    mockVerifyWebhook.mockRejectedValueOnce(
      new Error("authorization header is empty"),
    );
    const body = JSON.stringify({ event: "room_finished" });
    const req = makeRequest(body); // no authHeader

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockWebhookDedupe).not.toHaveBeenCalled();
    expect(mockAutoComplete).not.toHaveBeenCalled();
  });

  // ── Scenario 3: dedupe hit → 200, no dispatch ────────────────────────

  it("returns 200 { deduped: true } and does NOT dispatch when the event id was already claimed", async () => {
    mockWebhookDedupe.mockResolvedValueOnce({ isNew: false });
    const body = JSON.stringify({ event: "room_finished" });
    const req = makeRequest(body, "Bearer jwt-valid");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, deduped: true });
    expect(mockAutoComplete).not.toHaveBeenCalled();
  });

  // ── Scenario 4: dedupe miss + non-room_finished → 200 no-op ─────────

  it("returns 200 { ignored: <event> } and does NOT dispatch for non-room_finished events", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      event: "room_started",
      id: EVENT_ID,
      room: { name: ROOM_NAME },
    } as unknown as WebhookEvent);
    const body = JSON.stringify({ event: "room_started" });
    const req = makeRequest(body, "Bearer jwt-valid");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, ignored: "room_started" });
    expect(mockAutoComplete).not.toHaveBeenCalled();
  });

  // ── Scenario 5: dispatch called with the correct event payload ───────

  it("calls autoCompleteOnRoomFinishedUseCase with the parsed event payload (id, event, room.name)", async () => {
    const event = makeRoomFinishedEvent({ numParticipants: 3 });
    mockVerifyWebhook.mockResolvedValueOnce(event);
    const body = JSON.stringify({ event: "room_finished" });
    const req = makeRequest(body, "Bearer jwt-valid");

    await POST(req);

    expect(mockAutoComplete).toHaveBeenCalledTimes(1);
    const calledWith = mockAutoComplete.mock.calls[0]![1] as { event: WebhookEvent };
    expect(calledWith.event.event).toBe("room_finished");
    expect(calledWith.event.id).toBe(EVENT_ID);
    expect(calledWith.event.room?.name).toBe(ROOM_NAME);
    expect(
      (calledWith.event.room as unknown as { num_participants?: number })
        .num_participants,
    ).toBe(3);
  });

  // ── Bonus: use case throws → 200 { ok: false } (LiveKit stops retrying)

  it("returns 200 { ok: false, error: 'internal' } when the use case throws (LiveKit stops retrying)", async () => {
    mockAutoComplete.mockRejectedValueOnce(new Error("connection refused"));
    const body = JSON.stringify({ event: "room_finished" });
    const req = makeRequest(body, "Bearer jwt-valid");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: false, error: "internal" });
  });

  // ── Bonus: parsed event has no `event` field → 400 ──────────────────

  it("returns 400 when the parsed WebhookEvent has no `event` field", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({} as unknown as WebhookEvent);
    const body = "{}";
    const req = makeRequest(body, "Bearer jwt-valid");

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockWebhookDedupe).not.toHaveBeenCalled();
    expect(mockAutoComplete).not.toHaveBeenCalled();
  });
});
