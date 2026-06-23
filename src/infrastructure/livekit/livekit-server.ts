import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
import type { WebhookEvent } from "livekit-server-sdk";

/**
 * Input shape for `LiveKitServerClient.createRoomToken`.
 */
export interface CreateRoomTokenInput {
  /** LiveKit identity, e.g. `doctor-<uuid>` or `paciente-<uuid>`. */
  identity: string;
  /** LiveKit room name, e.g. `cita-<uuid>`. */
  roomName: string;
  /** Token TTL as a duration string accepted by the SDK (default `"1h"`). */
  ttl?: string;
}

/**
 * Output shape for `LiveKitServerClient.createRoomToken`.
 */
export interface CreateRoomTokenOutput {
  /** The LiveKit JWT. */
  token: string;
  /** The signaling URL the client must connect to. */
  serverUrl: string;
  /** Echo of the room name for the caller's convenience. */
  roomName: string;
}

/**
 * Thin wrapper around `livekit-server-sdk`'s `AccessToken` and
 * `WebhookReceiver`. Owns the SDK detail and the env-var lifecycle so
 * the application layer can stay framework-free.
 *
 * The class is instantiated eagerly as a module-level singleton
 * (`livekitServerClient`) at the bottom of this file. The constructor's
 * env-var check therefore runs at the moment any module imports
 * `livekit-server.ts` — a missing `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
 * or `NEXT_PUBLIC_LIVEKIT_URL` throws HERE, at import time, so a
 * misconfigured environment fails the Next.js boot instead of surfacing
 * as a per-request `INTERNAL_SERVER_ERROR` when a patient tries to
 * join the call three hours later in production.
 *
 * REQ-LI-INIT-1 (livekit-infrastructure spec).
 */
export class LiveKitServerClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly serverUrl: string;

  constructor() {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!apiKey || !apiSecret || !serverUrl) {
      throw new Error(
        "LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. " +
          "See docs/livekit.md for setup.",
      );
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.serverUrl = serverUrl;
  }

  /**
   * Builds a LiveKit access token with the standard 1:1 video-consult grants
   * (`roomJoin: true`, `canPublish: true`, `canSubscribe: true`,
   * `canPublishData: false` — in-call chat is out of scope).
   */
  async createRoomToken(input: CreateRoomTokenInput): Promise<CreateRoomTokenOutput> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      ttl: input.ttl ?? "1h",
    });
    at.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false, // in-call chat is out of scope
    });
    const token = await at.toJwt();
    return { token, serverUrl: this.serverUrl, roomName: input.roomName };
  }

  /**
   * Verifies a LiveKit webhook POST and returns the parsed event.
   *
   * Wraps `livekit-server-sdk`'s `WebhookReceiver` (livekit-webhooks, D1,
   * AD-2). The SDK validates the JWT in the `Authorization` header against
   * `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` AND verifies that the JWT's
   * `sha256` claim matches the sha256 of the raw body — so a tampered
   * body or a tampered header produces a throw.
   *
   * Throws on:
   *   - missing `Authorization` header (SDK message: "authorization header is empty")
   *   - signature mismatch (SDK message: "sha256 checksum of body does not match")
   *   - expired token
   *
   * The route handler catches the throw and maps it to 401.
   *
   * AD-3: the body MUST be the raw bytes LiveKit sent (the JWT signature
   * hashes the exact bytes; parse-and-restringify breaks the hash). The
   * route handler reads `await req.text()`, NOT `req.json()`.
   */
  async verifyWebhook(rawBody: string, authHeader: string): Promise<WebhookEvent> {
    const receiver = new WebhookReceiver(this.apiKey, this.apiSecret);
    return receiver.receive(rawBody, authHeader);
  }
}

// Module-level eager singleton (REQ-LI-INIT-1). The constructor reads
// `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` from
// `process.env`; a missing var throws HERE, at import time, so a
// misconfigured environment fails the Next.js boot instead of surfacing
// as a per-request `INTERNAL_SERVER_ERROR` when a patient tries to join
// the call three hours later in production. REQ-LI-INIT-1.
export const livekitServerClient = new LiveKitServerClient();
