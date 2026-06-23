// @vitest-environment node
//
// The default vitest unit-test environment is jsdom, which ships its
// own `TextEncoder` / `Uint8Array`. The `livekit-server-sdk` / `jose`
// JWT verification path performs an `instanceof Uint8Array` check
// against the global `Uint8Array` — jsdom's global is a different
// reference than Node's, so the SDK's HS256 verification rejects
// valid Node-built keys with "Received an instance of Uint8Array".
// Running in the Node environment makes both sides agree on the same
// built-in `Uint8Array`. We then sign the JWT directly with Node's
// `crypto.createHmac` (mirroring `AccessToken.toJwt`'s algorithm) so
// the test exercises the REAL signature math, not a mock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  LiveKitServerClient,
  livekitServerClient,
} from "../livekit-server";

/**
 * Build a JWT that the SDK's `WebhookReceiver` will accept.
 *
 * Required claims (mirroring `AccessToken.toJwt`):
 *   - iss: apiKey (LiveKit sets issuer = api key)
 *   - exp: now + ttl
 *   - nbf: now
 *   - sha256: base64(sha256(body))  ← the body hash the SDK checks
 *   - video: { roomJoin: true, room: ... }  (LiveKit grants)
 */
function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signWebhookJwt(opts: {
  apiKey: string;
  apiSecret: string;
  body: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = 5 * 60;
  const sha256B64 = createHash("sha256").update(opts.body, "utf8").digest("base64");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: opts.apiKey,
    exp: nowSec + ttlSec,
    nbf: nowSec,
    sha256: sha256B64,
    video: { roomJoin: true, room: "test-room" },
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac("sha256", opts.apiSecret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

const ORIGINAL_ENV = { ...process.env };

function setLivekitEnv(opts: {
  key?: string;
  secret?: string;
  url?: string;
}): void {
  if (opts.key === undefined) {
    delete process.env.LIVEKIT_API_KEY;
  } else {
    process.env.LIVEKIT_API_KEY = opts.key;
  }
  if (opts.secret === undefined) {
    delete process.env.LIVEKIT_API_SECRET;
  } else {
    process.env.LIVEKIT_API_SECRET = opts.secret;
  }
  if (opts.url === undefined) {
    delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  } else {
    process.env.NEXT_PUBLIC_LIVEKIT_URL = opts.url;
  }
}

describe("LiveKitServerClient env validation", () => {
  beforeEach(() => {
    // Reset to a known-clean state for each test
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  });

  afterEach(() => {
    // Restore the original env (no leakage to other tests)
    for (const k of Object.keys(process.env)) {
      if (!(k in ORIGINAL_ENV)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("constructs successfully when all three env vars are set", () => {
    setLivekitEnv({ key: "devkey", secret: "secret", url: "ws://localhost:7880" });
    expect(() => new LiveKitServerClient()).not.toThrow();
    const client = new LiveKitServerClient();
    expect(client).toBeInstanceOf(LiveKitServerClient);
  });

  it("throws the documented error when LIVEKIT_API_KEY is missing", () => {
    setLivekitEnv({ secret: "secret", url: "ws://localhost:7880" });
    let caught: unknown = null;
    try {
      new LiveKitServerClient();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toContain("LiveKit env vars missing");
    expect(msg).toContain("LIVEKIT_API_KEY");
    expect(msg).toContain("LIVEKIT_API_SECRET");
    expect(msg).toContain("docs/livekit.md");
  });

  it("throws the documented error when LIVEKIT_API_SECRET is missing", () => {
    setLivekitEnv({ key: "devkey", url: "ws://localhost:7880" });
    let caught: unknown = null;
    try {
      new LiveKitServerClient();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toContain("LiveKit env vars missing");
    expect(msg).toContain("LIVEKIT_API_KEY");
    expect(msg).toContain("LIVEKIT_API_SECRET");
    expect(msg).toContain("docs/livekit.md");
  });

  it("throws when NEXT_PUBLIC_LIVEKIT_URL is also missing (defense in depth)", () => {
    setLivekitEnv({ key: "devkey", secret: "secret" });
    expect(() => new LiveKitServerClient()).toThrow(/LiveKit env vars missing/);
  });
});

describe("livekitServerClient module-level const", () => {
  // The module's `livekitServerClient` is a top-level `const` that runs
  // `new LiveKitServerClient()` at import time (REQ-LI-INIT-1). We test
  // the exported value directly: a singleton reference that exposes the
  // documented `createRoomToken` and `verifyWebhook` methods. The env
  // validation behavior is covered by the `LiveKitServerClient env
  // validation` describe block above.
  //
  // Note: `vi.resetModules()` is intentionally NOT used here. The
  // module-level `const` runs ONCE per module load, and we want this
  // test to exercise the same module the rest of the suite imports
  // (so the singleton reference is the same `livekitServerClient`
  // value other call sites see).

  it("is a LiveKitServerClient instance", () => {
    expect(livekitServerClient).toBeInstanceOf(LiveKitServerClient);
  });

  it("exposes createRoomToken and verifyWebhook methods", () => {
    expect(typeof livekitServerClient.createRoomToken).toBe("function");
    expect(typeof livekitServerClient.verifyWebhook).toBe("function");
  });

  it("is the same reference on every import of the module (Node module cache)", async () => {
    const mod = await import("../livekit-server");
    expect(mod.livekitServerClient).toBe(livekitServerClient);
  });
});

describe("LiveKitServerClient.verifyWebhook", () => {
  beforeEach(() => {
    setLivekitEnv({ key: "devkey", secret: "secret", url: "ws://localhost:7880" });
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ORIGINAL_ENV)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns the parsed event for a valid signature (real SDK round-trip)", async () => {
    // Real SDK round-trip: sign a JWT the SDK itself will accept, then
    // call verifyWebhook with the raw body. Mocking "return success" would
    // be testing the mock, so we exercise the JWT signature path end-to-end.
    const citaId = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
    const eventId = "evt-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const body = JSON.stringify({
      event: "room_finished",
      id: eventId,
      room: {
        name: `cita-${citaId}`,
        num_participants: 2,
      },
    });
    const jwt = signWebhookJwt({
      apiKey: "devkey",
      apiSecret: "secret",
      body,
    });

    const client = new LiveKitServerClient();
    const parsed = await client.verifyWebhook(body, jwt);

    expect(parsed.event).toBe("room_finished");
    expect(parsed.id).toBe(eventId);
    expect(parsed.room?.name).toBe(`cita-${citaId}`);
    // The wire JSON uses `num_participants` (snake_case); the TypeScript
    // declaration exposes `numParticipants` (camelCase alias). The SDK's
    // proto3-generated `WebhookEvent` class reads whichever form is
    // present; the use case reads both with a fallback. We assert that
    // AT LEAST ONE form carries the count from the wire payload so a
    // regression that drops BOTH is caught here (the use case also
    // handles this case — see auto-complete-on-room-finished.use-case.ts).
    const roomAny = parsed.room as unknown as {
      num_participants?: number;
      numParticipants?: number;
    };
    const count = roomAny.num_participants ?? roomAny.numParticipants;
    expect(count).toBe(2);
  });

  it("throws with the SDK's 'sha256' mismatch message when the body is tampered", async () => {
    // Sign a JWT for `bodyA`, then call verifyWebhook with `bodyB`. The
    // SDK verifies the JWT signature (passes) but the sha256-of-body
    // claim no longer matches the actual body hash → throw.
    const bodyA = JSON.stringify({
      event: "room_finished",
      id: "evt-aaaa",
      room: { name: "cita-aaaa", num_participants: 1 },
    });
    const bodyB = JSON.stringify({
      event: "room_finished",
      id: "evt-aaaa",
      room: { name: "cita-aaaa", num_participants: 99 },
    });
    const jwt = signWebhookJwt({
      apiKey: "devkey",
      apiSecret: "secret",
      body: bodyA,
    });

    const client = new LiveKitServerClient();
    let caught: unknown = null;
    try {
      await client.verifyWebhook(bodyB, jwt);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/sha256/i);
  });

  it("throws with the SDK's 'authorization header is empty' message when authHeader is empty", async () => {
    const body = JSON.stringify({
      event: "room_finished",
      id: "evt-aaaa",
      room: { name: "cita-aaaa", num_participants: 1 },
    });

    const client = new LiveKitServerClient();
    let caught: unknown = null;
    try {
      await client.verifyWebhook(body, "");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/authorization header is empty/i);
  });
});
