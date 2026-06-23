import { NextResponse } from "next/server";
import type { WebhookEvent } from "livekit-server-sdk";

import { livekitServerClient } from "@/infrastructure/livekit/livekit-server";
import { webhookDedupe } from "@/infrastructure/redis/cache";
import { db } from "@/infrastructure/db";
import { autoCompleteOnRoomFinishedUseCase } from "@/application";

/**
 * POST handler for LiveKit webhook deliveries.
 *
 * Lives at `/api/livekit/webhook` — NOT under `/api/trpc/` (AD-1 / D2).
 * The route handler is the trust boundary: the LiveKit JWT signature is
 * the entire auth model. There is no Auth.js session, no IP allowlist.
 *
 * Pipeline (livekit-webhooks, D1 / D3 / D4 / D5 / AD-1..AD-5):
 *   1. Read the raw body via `await req.text()` — NOT `req.json()`. The
 *      JWT signature hashes the exact bytes LiveKit sent; parse-and-
 *      restringify breaks the hash (AD-3).
 *   2. Verify the signature via `LiveKitServerClient.verifyWebhook`. The
 *      SDK's `WebhookReceiver` validates the JWT against the env-var
 *      API key/secret AND verifies the body sha256 match. Throws on
 *      mismatch / missing header / expired token → 401.
 *   3. Dedupe by `event.id` via `webhookDedupe()` — Redis `SET NX EX
 *      86400`. Replays return 200 OK without re-running the dispatch
 *      (R2 mitigation / AD-5).
 *   4. Only `room_finished` is dispatched. Every other event family
 *      (`room_started`, `participant_*`, `track_*`, `egress_*`,
 *      `ingress_*`) returns 200 OK no-op (D5).
 *   5. The use case is the only caller of `autoCompleteOnRoomFinishedUseCase`
 *      (AD-9). Its errors are swallowed and 200 OK is returned so
 *      LiveKit stops retrying.
 *
 * Response codes:
 *   200 — success (including dedupe hits, non-room_finished events, AND
 *         use-case throws so LiveKit stops retrying).
 *   400 — malformed body (the SDK parsed a JSON payload but no `event` field).
 *   401 — signature mismatch or missing Authorization header.
 *
 * Next.js route config:
 *   - `runtime = "nodejs"` — required because `WebhookReceiver` uses
 *     `node:crypto` for JWT verification. The Edge runtime does not have
 *     `node:crypto` and would fail at verification time.
 *   - `dynamic = "force-dynamic"` — webhook POSTs must never be cached.
 */
export async function POST(req: Request): Promise<NextResponse> {
  // 1. Read the raw body — NOT `req.json()`. The JWT signature hashes
  //    the exact bytes LiveKit sent (AD-3).
  const rawBody = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";

  // 2. Verify the signature. Throws on mismatch / missing header /
  //    expired token. Map to 401.
  let event: WebhookEvent;
  try {
    event = await livekitServerClient.verifyWebhook(rawBody, authHeader);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[livekit webhook] signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 3. Defensive parse-check. The SDK returns a parsed WebhookEvent for
  //    well-formed bodies; an empty body or an unrecognized shape may
  //    return an event without the `event` field. Map to 400.
  if (!event?.event) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // 4. Dedupe by `event.id`. Every LiveKit event has a UUID; the TTL is
  //    24h (D4). Degrade-open on Redis unreachable — the use case is
  //    itself idempotent (terminal states are no-ops, the optimistic
  //    UPDATE catches races — AD-5).
  const { isNew } = await webhookDedupe(event.id);
  if (!isNew) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // 5. Dispatch only `room_finished` (D5). Every other event returns
  //    200 OK no-op.
  if (event.event !== "room_finished") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  // 6. Dispatch to the internal use case. The route handler is the
  //    ONLY caller (AD-9). Errors are swallowed and 200 OK is returned
  //    so LiveKit stops retrying — but the use case's invariants make
  //    throws rare (only DB-level errors).
  //
  //    `db as never` matches the project's pattern: the application-layer
  //    use cases are typed against `drizzle-orm/node-postgres`'s
  //    `NodePgDatabase`, but `db` here is `drizzle-orm/postgres-js`'s
  //    `PostgresJsDatabase`. Both expose the same Drizzle query builder
  //    surface; the cast keeps the call-site clean. (See `bookings.ts`
  //    tRPC router — every use-case call uses the same `db as never`
  //    cast.)
  try {
    const result = await autoCompleteOnRoomFinishedUseCase(
      db as never,
      { event },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[livekit webhook] auto-complete use case threw:",
      err instanceof Error ? err.message : err,
    );
    // 200 OK anyway so LiveKit stops retrying. The error is logged
    // for ops follow-up.
    return NextResponse.json(
      { ok: false, error: "internal" },
      { status: 200 },
    );
  }
}

// Next.js route config — `node:crypto` is required by the SDK and the
// route handler must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
