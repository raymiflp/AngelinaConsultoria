# Proposal: LiveKit Room-Finished Webhook (Auto-Complete Citas)

## Change Name

`livekit-webhooks` (folder: `2026-06-19-livekit-webhooks`)

## Intent

The video-calls change (`2026-06-16`, archived) shipped the call mechanics — `LiveKitServerClient.createRoomToken`, `getRoomToken`, `JoinCallButton`, the `livekit` Docker service — but documented a deliberate limitation in its D10: when a patient and doctor leave a LiveKit room without either side clicking "Completar" or "No asistio", the cita stays in `EN_CURSO` indefinitely. The footer of `src/app/citas/[id]/llamada/page.tsx` calls this out in the UI, and the same note is duplicated in `openspec/specs/video-calls-ui/spec.md`, the video-calls archive report, and `docs/livekit.md`. The change you are about to read is the D10 mitigation: a LiveKit `room_finished` webhook auto-transitions an `ONLINE` cita from `EN_CURSO` to `COMPLETADA` (if at least one participant joined) or `NO_ASISTIO` (if the room opened but nobody joined), writes a system-actor audit row, and removes the manual-completion burden from the doctor.

The change is **additive at the data plane** (one small migration making `audit_logs.usuario_id` nullable so system actors can attribute audit rows to themselves), **additive at the infra plane** (one new `livekit.yaml` config mounted into the existing container, one docker-compose tweak for `extra_hosts` on Linux), **additive at the HTTP plane** (one new Next.js route handler at `POST /api/livekit/webhook` — NOT a tRPC procedure, NOT under `/api/trpc/`), and **additive at the domain plane** (one new use case `autoCompleteOnRoomFinishedUseCase` that orchestrates dedupe → modality check → optimistic state transition → audit row). It reuses everything the video-calls and modality-toggle changes already shipped: the `livekit-server-sdk@2.15.4` (already a dep), the `LiveKitServerClient` wrapper, the `Cita.livekitRoomName` derivation (`cita-${uuid}`), the `citas.modalidad` column and `getRoomToken` modality gate, and the audit-log write pattern.

The change is **modality-aware**: the webhook handler ignores `PRESENCIAL` citas defensively (D7), which the modality-toggle change made safe to do (PRESENCIAL citas never receive a token, so they should never produce a webhook). It is **idempotent**: the route handler dedupes by `event.id` in Redis with a 24h TTL, and the use case's state machine no-ops for terminal states. It is **race-safe**: the state transition uses a single `UPDATE ... WHERE estado = 'EN_CURSO'` and treats a `rowCount === 0` as "doctor beat us to it, do nothing". It is **closed-loop**: after this lands, the D10 footer note on the call page is removed and the `video-calls-ui` spec marks the limitation as RESOLVED.

## Why

The explore phase (engram id `465`, `sdd/livekit-webhooks-2026-06-19/explore`, project `medico-consulta`, saved 2026-06-19 19:00:17) found six concrete gaps. Each one is a real surface in the running app that contradicts what the platform promises:

1. **No webhook receiver endpoint** — `src/app/api/` has no `livekit/` folder. There is no Next.js route handler that can receive a `room_finished` POST. The self-hosted LiveKit container at `docker-compose.yml` lines 77-90 runs with `--dev --bind 0.0.0.0` and no `webhook:` block — webhooks are silently disabled.
2. **No `WebhookReceiver` instance** — `src/infrastructure/livekit/livekit-server.ts` (80 lines, the `LiveKitServerClient` class) instantiates `AccessToken` for token issuance but never instantiates `WebhookReceiver` from the same SDK. The verification primitive is already in the dep tree (`package.json:59`, `livekit-server-sdk@2.15.4`); it just isn't wired up.
3. **No `livekit.yaml` config** — the LiveKit container has no config file mounted. The `--dev` flag is permissive defaults only. To enable webhooks, a YAML file with a `webhook:` block must be mounted at `/etc/livekit.yaml` and `--config /etc/livekit.yaml` must be added to the command.
4. **No idempotency layer** — `src/infrastructure/redis/cache.ts` exposes `cacheGetOrSet` and `cacheInvalidate` for slot caching, but there is no `webhookDedupe(key, ttl)` helper. LiveKit explicitly warns "no delivery guarantees, retries on transient failure" — a receiver MUST be idempotent.
5. **No use case to transition cita on `room_finished`** — `updateAppointmentStatusUseCase` (the path used by the doctor's "Completar" button) checks `cita.doctorId !== doctorId` and throws `FORBIDDEN`. The webhook handler cannot pass a doctorId (LiveKit is the actor, not a human). A new use case is required.
6. **`audit_logs.usuario_id` is `notNull`** — `src/infrastructure/db/schema/audit-logs.ts:8-10` enforces `uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" })`. The new system-actor audit row (LiveKit server, not a human) cannot be written without a small migration to make the column nullable. This is the ONLY schema change in the change.

The change is small in absolute terms (~800 lines, right at the user's D2 cap) and high-leverage: it closes the manual-completion footgun, removes the call-page footer that confesses to the limitation, and makes the platform's "online consultations work" promise actually true end-to-end.

## What changes

### Data plane

| # | What | Where |
|---|---|---|
| 1 | Migration `0005_*.sql` — single statement: `ALTER TABLE "audit_logs" ALTER COLUMN "usuario_id" DROP NOT NULL` (D9, OQ7=yes) | `src/infrastructure/db/migrations/0005_*.sql` — generated by `drizzle-kit generate`, post-edited |
| 2 | `audit-logs.ts` schema — `usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "cascade" })` (drop `.notNull()`). The existing FK and `onDelete: "cascade"` stay. | `src/infrastructure/db/schema/audit-logs.ts` — one-line change |
| 3 | Migration is forward-and-back clean: down-migration is `ALTER TABLE "audit_logs" ALTER COLUMN "usuario_id" SET NOT NULL`. Will fail if any `usuario_id IS NULL` rows exist; the test asserts no NULLs are written by any non-webhook code path. | same migration file |

### Infrastructure plane — LiveKit config

| # | What | Where |
|---|---|---|
| 4 | New file `docker/dev/livekit.yaml` — port, bind, RTC ports, TURN off, `webhook:` block with `api_key: devkey` and `urls: [http://host.docker.internal:3000/api/livekit/webhook]`, `keys:` block with base64-encoded `secret` (D11) | `docker/dev/livekit.yaml` — new file |
| 5 | `docker-compose.yml` — `livekit` service (lines 77-90) gets: (a) `volumes:` mount `./docker/dev/livekit.yaml:/etc/livekit.yaml:ro`, (b) command append `--config /etc/livekit.yaml`, (c) `extra_hosts: - "host.docker.internal:host-gateway"` (Linux parity, R8). Windows/Mac users already have `host.docker.internal` from Docker Desktop. | `docker-compose.yml` — three edits to the `livekit` service block |
| 6 | New env var `LIVEKIT_WEBHOOK_URL` (default `http://host.docker.internal:3000/api/livekit/webhook`) — used for env-var indirection in the YAML via Docker Compose `${LIVEKIT_WEBHOOK_URL:-...}`. Documented in `.env.example` and `.env.local.example`. | `.env.example` + `.env.local.example` — one-line addition each |

### Infrastructure plane — Redis idempotency

| # | What | Where |
|---|---|---|
| 7 | New helper `webhookDedupe(eventId: string, ttlSeconds?: number)` in `src/infrastructure/redis/cache.ts` (D4). Returns `{ isNew: true }` on first delivery, `{ isNew: false }` on replay. Internally: `SET livekit:webhook:${eventId} 1 NX EX ${ttlSeconds ?? 86400}`. Returns the prior value if Redis is unreachable (degrade-open: replay possible, but the state machine still no-ops for terminal states). | `src/infrastructure/redis/cache.ts` — extends the existing 50-line file |
| 8 | The `redis` export at `src/infrastructure/redis/index.ts` is already a graceful-null ioredis client (verified — falls back to `fetcher()` when unreachable). No new connection setup needed. | no change |

### HTTP plane — route handler

| # | What | Where |
|---|---|---|
| 9 | New file `src/app/api/livekit/webhook/route.ts` — Next.js App Router POST handler. Reads raw body via `await req.text()` (NOT `req.json()` — the signature hash needs the raw bytes). Calls `LiveKitServerClient.verifyWebhook(rawBody, authHeader)`. Switch on `event.event` — `room_finished` dispatches to the use case; everything else returns 200 OK immediately. All error paths return 200 OK (so LiveKit stops retrying) except signature failure (401) and malformed JSON (400). D1, D2, D3. | `src/app/api/livekit/webhook/route.ts` — new file, ~80 lines |
| 10 | `LiveKitServerClient.verifyWebhook(rawBody: string, authHeader: string): WebhookEvent` — instantiates `new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).receive(rawBody, authHeader)`. Throws on signature mismatch / missing header. The route handler catches and maps to 401. D1. | `src/infrastructure/livekit/livekit-server.ts` — extends the existing 80-line file |
| 11 | The route handler is NOT under `/api/trpc/` — it's a raw Next.js route handler at `/api/livekit/webhook`. This matches LiveKit's docs (`/webhook-endpoint` example) and groups all future LiveKit HTTP surfaces (recording, egress) under `/api/livekit/`. | path-only decision, no code impact beyond step 9 |

### Domain plane — use case

| # | What | Where |
|---|---|---|
| 12 | New use case `autoCompleteOnRoomFinishedUseCase` — extracts the cita UUID from `event.room.name` via regex `/^cita-([0-9a-f-]{36})$/` (mirrors `Cita.livekitRoomName` derivation), loads the cita by id, checks `cita.modalidad === ONLINE` (D7 — defensive ignore for PRESENCIAL), checks estado is `EN_CURSO` (D6 — no-op for CONFIRMADA, PENDIENTE, and all terminal states), runs the optimistic `UPDATE citas SET estado = ?, ended_at = NOW() WHERE id = ? AND estado = 'EN_CURSO'` (D6), inspects `rowCount`: 0 = doctor beat us, return success-no-audit; 1 = we won, write audit row with `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'` and `detalles: { eventId, roomName, participantCount, finalState }` (D9). The `participantCount` is read from `event.room.num_participants` (or `event.participant?.joined_count` per context7 — to be confirmed in design). Threshold: ≥1 → `COMPLETADA`, 0 → `NO_ASISTIO`. The use case is intentionally NOT a tRPC procedure — it has no caller, only the route handler invokes it. | `src/application/use-cases/bookings/auto-complete-on-room-finished.use-case.ts` — new file, ~90 lines |
| 13 | `AuditAction` union extended with `'CITA_AUTO_COMPLETED_BY_WEBHOOK'` (D9). Additive, no rename. The `writeAuditLogUseCase` type widens to accept `usuarioId: string \| null`. Existing callers (every human-actor audit row) continue to pass a real user id; the new path passes `null`. | `src/application/use-cases/audit/write-audit-log.use-case.ts` — one-line union extension + type widening on the use case input |
| 14 | The new use case is NOT wrapped in a tRPC procedure, NOT exposed via the API surface. It's an internal orchestration primitive called only by the route handler. This avoids accidentally exposing it to the SPA as a callable mutation (a doctor with curl could otherwise force-complete any `EN_CURSO` cita). | convention; enforced by file location under `use-cases/` and the absence of a router entry |

### UI plane — D10 footer removal

| # | What | Where |
|---|---|---|
| 15 | Remove the D10 limitation footer from `src/app/citas/[id]/llamada/page.tsx`. The footer currently reads (paraphrased): "Si la videollamada termina sin que ninguno de los dos marque Completar/No asistio, la cita quedará en curso hasta que sea completada manualmente." Remove the `<div>` block and the supporting test assertion. | `src/app/citas/[id]/llamada/page.tsx` — one block deletion; test file loses one scenario |
| 16 | Update `docs/livekit.md` — add a "Webhooks" section explaining: what events we handle, the `livekit.yaml` shape, the `host.docker.internal` caveat on Linux, and the audit log side-effect. Also remove the "D10 limitation" paragraph that lives in the existing doc. | `docs/livekit.md` — additive section + one paragraph deletion |

### Spec plane

| # | What | Where |
|---|---|---|
| 17 | Delta on `livekit-infrastructure/spec.md` — `Webhook Configuration` requirement: `livekit.yaml` shape, mount path, `--config` flag, `host.docker.internal` cross-platform handling, `LIVEKIT_WEBHOOK_URL` env var. Mark as REQUIRED. | `openspec/changes/2026-06-19-livekit-webhooks/specs/livekit-infrastructure/spec.md` |
| 18 | Delta on `video-calls-api/spec.md` — `Webhook Auto-Completion` requirement: `room_finished` → `COMPLETADA`/`NO_ASISTIO` transition logic, modality gate (PRESENCIAL ignored, defensive), terminal-state idempotency, optimistic-locking SQL, `CITA_AUTO_COMPLETED_BY_WEBHOOK` audit action. Mark D10 as RESOLVED. | `openspec/changes/2026-06-19-livekit-webhooks/specs/video-calls-api/spec.md` |
| 19 | Delta on `booking-api/spec.md` — forward pointer to `autoCompleteOnRoomFinishedUseCase` (no new public procedure; just a note that cita state can now change without a `bookings.updateAppointmentStatus` call from a doctor). | `openspec/changes/2026-06-19-livekit-webhooks/specs/booking-api/spec.md` |
| 20 | Delta on `video-calls-ui/spec.md` — REMOVE the D10 footer note requirement. After this lands, the call page does NOT show the limitation. | `openspec/changes/2026-06-19-livekit-webhooks/specs/video-calls-ui/spec.md` |
| 21 | No new specs. The change lives inside the existing `livekit-infrastructure`, `video-calls-api`, `video-calls-ui`, and `booking-api` domains. (The explore report offered `livekit-webhooks` as a new spec; the propose phase recommends 4 deltas instead, matching the precedent set by the video-calls change which used the existing `video-calls-*` and `livekit-infrastructure` triplet without adding a fourth.) | — |

### Test plane

| # | What | Where |
|---|---|---|
| 22 | `LiveKitServerClient.verifyWebhook` unit — valid signature returns event; invalid signature throws; missing auth header throws; expired-token signature throws. | `src/infrastructure/livekit/__tests__/livekit-server.verifyWebhook.test.ts` (new) |
| 23 | `webhookDedupe` helper unit — first delivery returns `isNew: true`; replay returns `isNew: false`; Redis-unreachable degrades to `isNew: true` (degrade-open, see step 7). | `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` (new) |
| 24 | Route handler integration — POST `/api/livekit/webhook` with valid signature returns 200; invalid signature returns 401; `room_finished` dispatches to use case; `room_started` / `participant_joined` / `participant_left` return 200 no-op; malformed JSON returns 400; replay of a dedupe'd event returns 200 without re-dispatching. | `src/app/api/livekit/webhook/__tests__/route.test.ts` (new) |
| 25 | Use case unit — ONLINE + ≥1 participant → `COMPLETADA` + audit row; ONLINE + 0 participants → `NO_ASISTIO` + audit row; PRESENCIAL → no-op (warn logged, no audit); terminal state (`COMPLETADA` / `CANCELADA` / `NO_ASISTIO`) → no-op; `CONFIRMADA` (not yet `EN_CURSO`) → no-op; `PENDIENTE` → no-op; cita missing (room name matches no row) → no-op; optimistic lock race (doctor beat us to `COMPLETADA`) → no-op. | `src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts` (new) |
| 26 | Migration test — `0005` migration applies forward and back; the down-migration fails if any `usuario_id IS NULL` rows exist; existing human-actor audit rows continue to have `NOT NULL` enforcement until the migration is applied. | extend `src/infrastructure/db/__tests__/migrations.test.ts` |
| 27 | D10 footer removal — extend `src/app/citas/[id]/llamada/__tests__/page.test.tsx` to assert the footer is no longer rendered. | existing call page test — one assertion deleted + one assertion added |

**File count (single PR, ~800 lines):**

- **New (~7):** `src/app/api/livekit/webhook/route.ts`, `docker/dev/livekit.yaml`, `auto-complete-on-room-finished.use-case.ts`, 4 test files (`verifyWebhook`, `webhookDedupe`, `route`, use case).
- **Modified (~12):** `src/infrastructure/db/schema/audit-logs.ts`, `docker-compose.yml`, `.env.example`, `.env.local.example`, `src/infrastructure/redis/cache.ts`, `src/infrastructure/livekit/livekit-server.ts`, `src/application/use-cases/audit/write-audit-log.use-case.ts`, `src/app/citas/[id]/llamada/page.tsx` (footer removal), `docs/livekit.md`, `src/infrastructure/db/migrations/0005_*.sql` (new migration), 4 spec files (deltas), 2 test files (call page footer + migration test extension).

## Default Decisions (D1–D11)

These 11 decisions are committed. The spec, design, apply, and verify phases MUST honor them verbatim.

### D1 — Webhook signature verification uses `livekit-server-sdk`'s `WebhookReceiver`

**Decision:** Use `WebhookReceiver` from `livekit-server-sdk@2.15.4` (already a dep). Wrap it in a new `verifyWebhook(rawBody: string, authHeader: string): WebhookEvent` method on the existing `LiveKitServerClient` class at `src/infrastructure/livekit/livekit-server.ts`. The method body is:

```ts
verifyWebhook(rawBody: string, authHeader: string): WebhookEvent {
  const receiver = new WebhookReceiver(this.apiKey, this.apiSecret);
  return receiver.receive(rawBody, authHeader);
}
```

The route handler catches `WebhookReceiver` throws and maps them to 401.

**Rationale:** The same SDK we already use for token issuance (`AccessToken` in `createRoomToken`). No new dep. The wrapper mirrors the existing class shape (constructor stores creds, methods return SDK objects). The cryptographic surface area is delegated to the SDK — we don't touch the JWT verification math.

**Alternative considered:** Roll-our-own with `jose` and a manual `verifyJWT` — rejected. The signature includes a sha256 of the payload hash, and any mistake in the canonicalization is a security bug. The SDK has been audited by the LiveKit team.

### D2 — Endpoint at `POST /api/livekit/webhook`

**Decision:** Next.js App Router POST handler at `src/app/api/livekit/webhook/route.ts`. NOT a tRPC procedure, NOT under `/api/trpc/`. The route handler reads `await req.text()` (raw body), verifies the signature, dispatches by `event.event`, returns 200 OK (or 401 on signature failure, 400 on malformed JSON).

**Rationale:** LiveKit's docs example (`/webhook-endpoint`) and the existing project convention (`src/app/api/health/route.ts` exists for a similar raw-purpose surface). Grouping future LiveKit HTTP surfaces under `/api/livekit/` (recording callbacks, egress events) keeps the API tree tidy. The handler is NOT a tRPC procedure because tRPC requires a typed procedure contract — webhooks are untrusted input and the handler is the trust boundary.

**Alternative considered:** Place under `/api/trpc/` and reuse the tRPC handler — rejected. tRPC handlers expect `Content-Type: application/json` with a procedure-shaped body; a raw webhook POST would fail the schema parse. The trust boundary belongs OUTSIDE tRPC.

### D3 — Authentication = `Authorization: <JWT>` via `WebhookReceiver`; no IP allowlist, no shared secret

**Decision:** The route handler reads `req.headers.get('authorization')` and passes both the raw body string and the header to `LiveKitServerClient.verifyWebhook(rawBody, authHeader)`. The `WebhookReceiver` validates the JWT signature against `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`. No IP allowlist (would be brittle in container networking; container IPs change across Docker restarts). No shared-secret header (would be weaker than the JWT, which includes a payload hash).

**Rationale:** The JWT signature is the canonical verification path. Same credentials as the token issuance path. The `Authorization` header is the documented LiveKit webhook contract. The endpoint is NOT publicly signed-in via Auth.js — it relies entirely on the cryptographic signature.

**Alternative considered:** HMAC shared secret in a custom header — rejected. LiveKit's documented contract is JWT, and rolling a parallel HMAC scheme is duplication.

### D4 — Idempotency via Redis `SET livekit:webhook:${eventId} 1 NX EX 86400`

**Decision:** New `webhookDedupe(eventId, ttlSeconds = 86400)` helper in `src/infrastructure/redis/cache.ts`. Implementation:

```ts
export async function webhookDedupe(
  eventId: string,
  ttlSeconds = 86400,
): Promise<{ isNew: boolean }> {
  if (!redis) return { isNew: true }; // degrade-open
  try {
    const result = await redis.set(`livekit:webhook:${eventId}`, "1", "EX", ttlSeconds, "NX");
    return { isNew: result === "OK" };
  } catch {
    return { isNew: true }; // degrade-open
  }
}
```

The route handler calls this BEFORE dispatch. On `{ isNew: false }` (replay), it returns 200 OK without invoking the use case. On `{ isNew: true }`, it proceeds.

**Rationale:** LiveKit explicitly warns "no delivery guarantees, retries on transient failure". Deduping by `event.id` (every LiveKit event has a UUID) is the cleanest pattern — 200 OK on replay tells LiveKit "we got it, stop retrying" without re-running the side effect. The 24h TTL is generous (events older than 24h are stale and can be dropped; the state has long since moved on). Degrade-open on Redis failure is the right call: a stale replay that runs the use case twice is harmless (the state machine is idempotent — terminal states are no-ops, and the optimistic UPDATE WHERE clause catches the race).

**Alternative considered:** Postgres table `webhook_events (id, processed_at)` — rejected. More moving parts, an extra DB round-trip per event, and a separate Drizzle migration. Redis is the right tool. No dedupe (accept the rare double-transition) — rejected. The use case would need to be defensively idempotent in every branch, which is harder to reason about than a 5-line dedupe helper.

### D5 — Trigger event = `room_finished` ONLY

**Decision:** The route handler's `switch (event.event)` matches `room_finished` only. Every other event (`room_started`, `participant_joined`, `participant_left`, `track_*`, `egress_*`, `ingress_*`) returns 200 OK immediately without invoking the use case. The dedupe step runs for ALL events (to prevent replay of any event from re-running the side effect), but only `room_finished` dispatches.

**Rationale:** D10 mitigation is "transition `EN_CURSO` cita when both leave". The most semantically clean signal is `room_finished` (the room is closed by the server). It's exactly one event per call lifecycle. `participant_left` is a noisy intermediate event (each participant generates one) and chaining it into a state machine is harder to reason about — you'd have to count "who has left" and "is this the last one?" which is fragile.

**Alternative considered:** Handle `participant_left` too and transition after the LAST one — rejected. Requires counting participants and tracking who has left, which is fragile. `room_finished` is the unambiguous "call is over" signal.

### D6 — State transition logic (D6 from explore)

**Decision:** On `room_finished` for an `ONLINE` cita:

| Pre-event estado | Webhook action |
|---|---|
| `PENDIENTE` | No-op (booking not confirmed yet — stray event, log warn) |
| `CONFIRMADA` | No-op (doctor hasn't started the consulta yet; doctor will start manually) |
| `EN_CURSO` + ≥1 participant joined | Transition to `COMPLETADA`, audit `CITA_AUTO_COMPLETED_BY_WEBHOOK` |
| `EN_CURSO` + 0 participants joined | Transition to `NO_ASISTIO`, audit `CITA_AUTO_COMPLETED_BY_WEBHOOK` |
| `COMPLETADA` / `CANCELADA` / `NO_ASISTIO` | No-op (terminal — D6 idempotent branch) |
| `PRESENCIAL` (defensive — D7) | No-op (log warn) |
| Cita missing (room name matches no row) | No-op (log warn, return 200) |
| Optimistic lock race (rowCount = 0 after WHERE) | No-op (doctor beat us; return 200, no audit) |

The optimistic UPDATE is the single atomic primitive:

```sql
UPDATE citas
SET estado = $1,
    updated_at = NOW()
WHERE id = $2
  AND estado = 'EN_CURSO';
```

If `rowCount === 0`, the cita is no longer in `EN_CURSO` (the doctor beat us, or another webhook already ran). The use case returns success-no-audit. This is the race-safety guarantee — there is no distributed-lock requirement and no double-transition possible.

**Rationale:** The `EN_CURSO → COMPLETADA` transition is the doctor's "I finished the call" action. The `EN_CURSO → NO_ASISTIO` transition is the doctor's "neither of us showed up" action. The webhook automates both. The "any participant joined" vs "zero participants joined" rule is the cleanest discriminator: if the doctor opened the room and the patient never joined, the right outcome is `NO_ASISTIO` (it was a no-show). If either party joined, the call happened — even for 30 seconds — and `COMPLETADA` is the honest state. The optimistic lock is the standard compare-and-swap pattern; `rowCount = 0` is the unambiguous "lost the race" signal.

**Alternative considered:** Always transition to `NO_ASISTIO` if both leave — rejected. If the doctor showed up, the call happened. A 30-second "wrong number" call is still a completed consultation from a billing standpoint. The doctor can dispute the transition via the existing `bookings.updateAppointmentStatus` flow if needed.

### D7 — PRESENCIAL cita with stale `livekit_room_name` is defensively ignored

**Decision:** If the webhook handler finds a `PRESENCIAL` cita by the room name, log `console.warn` with the cita id and the modality, and return 200 OK. Do NOT transition the state. Do NOT audit.

**Rationale:** Modality is the source of truth (per modality-toggle D6). A PRESENCIAL cita should never have received a token, so a webhook for one is unexpected. But the `citas.livekit_room_name` column exists in the schema and a future feature could populate it (or a manual SQL fix could); defensive ignore prevents a future bug from auto-completing the wrong cita. The handler also no-ops if the cita is missing entirely (the room name doesn't parse to a known UUID).

**Alternative considered:** Warn but transition anyway — rejected. PRESENCIAL citas are in-person meetings; we have no signal that the meeting happened. Auto-completing one based on a stale LiveKit room name would be a lie.

### D8 — Out-of-order events = trust LiveKit's in-order guarantee

**Decision:** Do NOT add explicit sequence tracking. Trust LiveKit's documented guarantee that "newer events for a room are not delivered until older events for the same room are delivered or abandoned". The handler's no-op rules (D6) cover the edge case where `room_finished` arrives for a cita still in `CONFIRMADA` (doctor hasn't started yet).

**Rationale:** LiveKit's guarantee is the simplest model. Adding our own sequencing would be redundant and bug-prone. The `room_finished` event is the LAST event in the room lifecycle, so ordering matters less for it than for intermediate events anyway.

### D9 — New `AuditAction` value `'CITA_AUTO_COMPLETED_BY_WEBHOOK'`; `usuario_id` becomes nullable

**Decision:**

- Add `'CITA_AUTO_COMPLETED_BY_WEBHOOK'` to the `AuditAction` union in `src/application/use-cases/audit/write-audit-log.use-case.ts`. The `detalles` jsonb payload is `{ eventId, roomName, participantCount, finalState: "COMPLETADA" | "NO_ASISTIO" }` — the webhook's `event.id` is included so the audit row is traceable to the LiveKit event for debugging.
- Migration `0005` makes `audit_logs.usuario_id` nullable (D9, OQ7=yes). The schema change is one line: drop `.notNull()` from `audit-logs.ts:9`. The FK and `onDelete: "cascade"` stay — existing human-actor rows are unaffected; new system-actor rows use `null`.
- `writeAuditLogUseCase` input type widens to `usuarioId: string | null`. Existing callers pass a real user id; the new path passes `null`.

**Rationale:** System actions should not be attributed to a human. Seeding a fake "SYSTEM" user is a code smell (conflates system and human actors in `usuarios`). The nullable column is the right evolution — the schema's invariant becomes "either a real user OR explicitly null", and the audit log can distinguish "I am the LiveKit server" from "I am a doctor who toggled a flag". The 5-line migration is the only schema change in a change that's otherwise additive.

**Alternative considered:** Seed a SYSTEM user — rejected, conflates system and human actors, requires updates to every existing user-listing query, and is more moving parts. A new `system_audit_logs` table — rejected, doubles the audit surface; a nullable `usuario_id` is the standard Postgres pattern for "this row has no human owner".

### D10 — Single PR at ~800 lines; soft exception if it ends up over

**Decision:** Ship as a single PR. If the final diff exceeds 800 lines, split into chained (stacked-to-main):

- **PR-1 (infra, ~400 lines):** `livekit.yaml`, docker-compose change, env vars, `LiveKitServerClient.verifyWebhook`, route handler, `webhookDedupe` helper, infra + API spec deltas, route + dedupe test files.
- **PR-2 (domain, ~400 lines):** `autoCompleteOnRoomFinishedUseCase`, `AuditAction` union extension, `0005` migration, `audit-logs.ts` schema change, `writeAuditLogUseCase` type widening, D10 footer removal, use case test, call page footer test extension.

**Rationale:** The estimated total is right at the user's 800-line cap. The change has a clean natural seam (infra vs domain), so if it lands over 800 the split is mechanical — the infra PR is independently shippable (route handler exists and is reachable, does nothing meaningful until PR-2 lands), the domain PR closes the loop. The chained-pr skill threshold is 400 lines; both slices fit comfortably.

**Alternative considered:** Always split — rejected. The infra + domain are tightly coupled (the route handler calls the use case, the use case writes to the audit log that the migration makes nullable). A forced split would mean PR-1 leaves a half-working system (the route exists but logs to nowhere). Single PR is preferred when the diff is at the cap and the natural seam exists for a safety split.

### D11 — `docker/dev/livekit.yaml` mounted at `/etc/livekit.yaml`; new env `LIVEKIT_WEBHOOK_URL`

**Decision:**

- New file `docker/dev/livekit.yaml`:

  ```yaml
  port: 7880
  bind_addresses:
    - ""
  rtc:
    tcp_port: 7881
    udp_port: 7882
  turn:
    enabled: false
  webhook:
    api_key: devkey
    urls:
      - ${LIVEKIT_WEBHOOK_URL:-http://host.docker.internal:3000/api/livekit/webhook}
  keys:
    devkey: <base64 of "secret">
  ```

- `docker-compose.yml` `livekit` service edits:
  - `volumes: - ./docker/dev/livekit.yaml:/etc/livekit.yaml:ro`
  - command becomes `["--dev", "--bind", "0.0.0.0", "--config", "/etc/livekit.yaml"]`
  - `extra_hosts: - "host.docker.internal:host-gateway"` (Linux parity, R8)
- New env var `LIVEKIT_WEBHOOK_URL` documented in `.env.example` and `.env.local.example` (default `http://host.docker.internal:3000/api/livekit/webhook`).

**Rationale:** `--dev` is preserved (permissive defaults, no cert requirements). `--config /etc/livekit.yaml` enables the `webhook:` block. `host.docker.internal` is host-specific (Mac/Windows Docker Desktop works out of the box; Linux requires `extra_hosts`). The env-var indirection (`${LIVEKIT_WEBHOOK_URL:-...}`) lets the same YAML be reused for staging/prod with different URLs. The base64-encoded `secret` in `keys:` is required by LiveKit's config schema (the `devkey: <secret>` shorthand is `--dev`-only and doesn't survive `--config`).

**Alternative considered:** Drop `--dev` and use config-only mode — rejected. `--dev` is the project's choice for self-hosted dev (the video-calls change shipped with `--dev --bind 0.0.0.0` and the new call page test relies on permissive defaults). Add a `certs:` block — out of scope (TLS is a separate follow-up `livekit-tls-prod`).

## Capabilities (contract with sdd-spec)

### New Capabilities

None. The change lives entirely inside the existing capability tree. (The explore report offered `livekit-webhooks` as a new spec; the propose phase recommends 4 deltas instead. The `video-calls` change shipped a similar cross-cutting concern — call mechanics — across the existing `video-calls-api`, `video-calls-ui`, and `livekit-infrastructure` triplet without adding a fourth. The same pattern fits here.)

### Modified Capabilities (delta specs)

- `livekit-infrastructure`: additive requirement on `Webhook Configuration` — the `livekit.yaml` shape (port, bind, RTC, TURN off, `webhook:` block, `keys:` base64), the mounted path (`/etc/livekit.yaml`), the `--config` flag, the `LIVEKIT_WEBHOOK_URL` env var with default, the `extra_hosts` Linux parity. Mark as REQUIRED.
- `video-calls-api`: additive requirement on `Webhook Auto-Completion` — the `room_finished` dispatch, the state transition logic (D6), the modality gate (D7), the terminal-state idempotency, the optimistic UPDATE SQL, the `CITA_AUTO_COMPLETED_BY_WEBHOOK` audit action with `detalles` shape. Mark D10 as RESOLVED. Add a forward pointer to the `audit_logs.usuario_id` nullable migration.
- `booking-api`: forward pointer to `autoCompleteOnRoomFinishedUseCase` — no new procedure, but a note that cita state can now change without a `bookings.updateAppointmentStatus` call from a doctor. Tests asserting "cita stays in EN_CURSO indefinitely after both leave" are updated.
- `video-calls-ui`: REMOVE the requirement about the D10 footer note. After this lands, the call page does NOT show the limitation. The "Recovery from disconnect" scenario is updated to "auto-completes via webhook" instead of "requires manual doctor action".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docker/dev/livekit.yaml` | New | Webhook config block, mounted at `/etc/livekit.yaml` (D11) |
| `docker-compose.yml` | Modified | `livekit` service: volume mount, `--config` flag, `extra_hosts` (D11) |
| `.env.example` | Modified | Add `LIVEKIT_WEBHOOK_URL` (D11) |
| `.env.local.example` | Modified | Add `LIVEKIT_WEBHOOK_URL` with dev default (D11) |
| `src/infrastructure/livekit/livekit-server.ts` | Modified | New `verifyWebhook` method using `WebhookReceiver` (D1) |
| `src/infrastructure/livekit/__tests__/livekit-server.verifyWebhook.test.ts` | New | Valid/invalid/expired/missing-header scenarios (D1) |
| `src/infrastructure/redis/cache.ts` | Modified | New `webhookDedupe` helper (D4) |
| `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` | New | First/replay/degrade-open scenarios (D4) |
| `src/app/api/livekit/webhook/route.ts` | New | POST handler, raw body read, dedupe, dispatch (D2, D3, D5) |
| `src/app/api/livekit/webhook/__tests__/route.test.ts` | New | Valid/invalid/dispatch/no-op/replay scenarios (D2-D5) |
| `src/application/use-cases/bookings/auto-complete-on-room-finished.use-case.ts` | New | Orchestrate dedupe → modality check → optimistic UPDATE → audit (D6, D7) |
| `src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts` | New | 8 scenarios (D6, D7, D8) |
| `src/application/use-cases/audit/write-audit-log.use-case.ts` | Modified | Add `'CITA_AUTO_COMPLETED_BY_WEBHOOK'` to union; widen input to `string \| null` (D9) |
| `src/infrastructure/db/schema/audit-logs.ts` | Modified | Drop `.notNull()` on `usuario_id` (D9, OQ7=yes) |
| `src/infrastructure/db/migrations/0005_*.sql` | New | `ALTER TABLE audit_logs ALTER COLUMN usuario_id DROP NOT NULL` (D9) |
| `src/infrastructure/db/__tests__/migrations.test.ts` | Modified | Forward-and-back test for `0005` (D9) |
| `src/app/citas/[id]/llamada/page.tsx` | Modified | REMOVE D10 footer (UI plane step 15) |
| `src/app/citas/[id]/llamada/__tests__/page.test.tsx` | Modified | Delete footer-renders assertion; add footer-does-NOT-render assertion |
| `docs/livekit.md` | Modified | Add "Webhooks" section; remove D10 limitation paragraph (UI plane step 16) |
| `openspec/changes/2026-06-19-livekit-webhooks/specs/livekit-infrastructure/spec.md` | New (delta) | Webhook Configuration requirement |
| `openspec/changes/2026-06-19-livekit-webhooks/specs/video-calls-api/spec.md` | New (delta) | Webhook Auto-Completion requirement; D10 RESOLVED |
| `openspec/changes/2026-06-19-livekit-webhooks/specs/booking-api/spec.md` | New (delta) | Forward pointer |
| `openspec/changes/2026-06-19-livekit-webhooks/specs/video-calls-ui/spec.md` | New (delta) | Remove D10 footer requirement |

## Architecture Decisions

| ID | Decision | Rationale | Alternatives Considered |
|---|---|---|---|
| **AD-1** | Webhook receiver is a Next.js route handler at `/api/livekit/webhook`, NOT a tRPC procedure (D2). | tRPC handlers expect typed procedure contracts with `Content-Type: application/json`. A raw webhook POST from LiveKit is untrusted input that must be parsed with the raw body intact for signature verification. The route handler IS the trust boundary; it must sit OUTSIDE tRPC. | Reuse tRPC handler — rejected, fails schema parse. Use a middleware — rejected, same problem. Server Action — rejected, Server Actions are for authenticated UI flows. |
| **AD-2** | Signature verification delegates entirely to `WebhookReceiver` from `livekit-server-sdk` (D1). | The SDK is already a dep, has been audited by the LiveKit team, and implements the canonical JWT-with-payload-hash verification. Rolling our own introduces a cryptographic surface area that, if wrong, is a security bug we cannot detect in tests. | Roll-our-own with `jose` — rejected, more attack surface. Shared HMAC secret — rejected, weaker than JWT and not the documented contract. |
| **AD-3** | The route handler reads the body via `await req.text()`, NOT `req.json()` (D1, D2). | The signature includes a sha256 of the EXACT bytes LiveKit sent. JSON-parse-then-stringify changes whitespace and key ordering, breaking the hash. The raw string is the only safe input to the signature verifier. | `req.json()` then `JSON.stringify` — rejected, byte-perfect guarantee is lost. Buffer the body — same as text(), but `text()` is the standard Next.js 15 idiom. |
| **AD-4** | Idempotency uses Redis `SET NX EX`, NOT a Postgres table (D4). | Redis is already used for slot caching (same module). A new Postgres table requires a migration AND an extra DB round-trip per event AND a separate Drizzle model. Redis is the right tool for short-lived dedupe keys. The TTL (24h) is the entire durability requirement — events older than 24h are stale and can be silently dropped. | Postgres `webhook_events` table — rejected, more moving parts. No dedupe (rely on terminal-state idempotency) — rejected, harder to reason about; the audit log would double-record. |
| **AD-5** | The dedupe helper degrades OPEN on Redis unreachability (returns `isNew: true`) (D4). | The state machine is itself idempotent (terminal states are no-ops, the optimistic UPDATE catches races). A replay that runs the use case twice is harmless. A `cache miss` that incorrectly returns `isNew: false` would silently drop legitimate events — much worse. | Degrade closed (return `isNew: false` on Redis error) — rejected, would drop legitimate events when Redis is down. |
| **AD-6** | Only `room_finished` triggers the state transition; all other events return 200 OK no-op (D5). | `room_finished` is the unambiguous "call is over" signal. It's exactly one event per call lifecycle. `participant_left` is a noisy intermediate (one per participant); chaining it into a state machine requires counting who has left, which is fragile. | Handle `participant_left` too — rejected, fragile counting logic. Handle every event — rejected, no business rule for the others. |
| **AD-7** | The state transition uses a single atomic `UPDATE ... WHERE estado = 'EN_CURSO'` and treats `rowCount === 0` as "doctor beat us" (D6, OQ5). | Compare-and-swap on the state column is the standard optimistic-locking pattern. `rowCount === 0` is the unambiguous signal that the cita is no longer in `EN_CURSO`. No distributed lock, no application-level mutex, no SELECT FOR UPDATE — the database does the work in one round-trip. | Application-level mutex — rejected, doesn't work across multiple Next.js instances. `SELECT FOR UPDATE` then `UPDATE` — rejected, two round-trips, longer lock window. Transaction with `transitionStatus()` call — rejected, `transitionStatus()` is in-memory; the race is in the SQL, not the domain rule. |
| **AD-8** | The `endedAt` semantic is folded into the existing `updated_at` column on `citas`, NOT a new `endedAt` column (OQ4 = no new columns). | `updated_at` already reflects the last state change. A separate `endedAt` column is duplication of data that the audit log already captures (`detalles.finalState` + `detalles.eventId`). One fewer migration, one fewer schema field, one fewer thing to keep in sync. | Add `endedAt` column — rejected, duplicate data. Add `livekit_room_sid` column — rejected, unused at runtime. |
| **AD-9** | The new use case is NOT wrapped in a tRPC procedure, NOT exposed via the API surface (D6 step 14). | The route handler is the only caller. Exposing it as a tRPC procedure would allow a curl request with a doctor session to force-complete any `EN_CURSO` cita — a privilege escalation. The use case is an internal orchestration primitive; its safety comes from being invoked only by the trusted route handler, which validates the LiveKit signature first. | Expose as `bookings.autoCompleteOnRoomFinished` — rejected, privilege escalation. Server Action — rejected, same exposure problem. |
| **AD-10** | `audit_logs.usuario_id` becomes nullable; new audit rows use `null` for system actors (D9, OQ7=yes). | System actions should not be attributed to a human. Seeding a SYSTEM user conflates system and human actors in the `usuarios` table and requires updates to every user-listing query. Nullable is the standard Postgres pattern for "this row has no human owner" and is a 5-line migration. The FK and `onDelete: "cascade"` stay — existing human-actor rows are unaffected. | Seed SYSTEM user — rejected, conflates system and human actors, more moving parts. New `system_audit_logs` table — rejected, doubles the audit surface; existing query patterns have to be duplicated. |
| **AD-11** | Audit `detalles` includes `eventId` so the audit row is traceable to the LiveKit event (D9). | The `event.id` is the single source of truth for "which LiveKit webhook fired". Including it in the audit row means a debugger can grep `audit_logs.detalles->>'eventId'` to find the exact LiveKit event for any auto-completed cita. Without it, "why did this cita auto-complete" is unanswerable. | Omit `eventId` — rejected, audit becomes un-debuggable. Store `eventId` in a separate column — rejected, more schema; jsonb is the right shape for webhook metadata. |
| **AD-12** | Chained PR if over 800 lines: PR-1 infra + PR-2 domain, stacked-to-main (D10). | The change has a clean natural seam: infra (yaml + docker + route + dedupe) is independently shippable (the route exists and is reachable but does nothing meaningful until PR-2 lands); domain (use case + audit + migration) closes the loop. The `stacked-to-main` strategy matches the precedent set by the video-calls and modality-toggle changes. | Single PR only — preferred when at the cap. Always split — rejected, infra alone leaves a half-working system. Feature-branch chain with tracker PR — overkill for 2 PRs and a clean linear dependency. |
| **AD-13** | `livekit.yaml` is mounted at `/etc/livekit.yaml`, NOT a docker-compose `--env-file`-style substitution. | LiveKit's `--config` flag expects a file path, not inline YAML. Mounting is the standard pattern. The env-var indirection (`${LIVEKIT_WEBHOOK_URL:-...}`) lets the same YAML work for staging/prod without re-mounting. | Inline YAML via `--config -` — rejected, harder to maintain. Generate the YAML at container start — rejected, adds a build step. |
| **AD-14** | `extra_hosts: host.docker.internal:host-gateway` is added defensively for Linux parity (D11, R8). | Mac/Windows Docker Desktop provides `host.docker.internal` out of the box. Linux requires the explicit mapping. Adding it for ALL platforms is harmless (the host resolves the same way on Mac/Windows) and prevents "works on my Mac, fails on CI Linux" surprises. | Conditionally add via shell — rejected, brittle. Document Linux-only — rejected, low-cost fix. |
| **AD-15** | The D10 footer note is REMOVED from the call page, NOT updated to mention the webhook. | The footer was a "we know this is broken" confession. After this change, it's not broken anymore. Leaving the footer (even with updated copy) would be a UX tax — the patient doesn't need to know about webhook plumbing. The audit log carries the traceability; the call page shows the current state, period. | Update the footer copy — rejected, patients don't need to know. Move the limitation to a docs page — redundant; the limitation is RESOLVED. |
| **AD-16** | The `livekit-server` image stays `livekit/livekit-server:latest` (no pin). | Same risk profile as the existing setup (video-calls change D6 deferred pinning). A major version bump could change the webhook payload shape, but the SDK is pinned and the payload is validated against the SDK types. The risk is documented in the `livekit-infrastructure` spec delta. | Pin the image — deferred to `livekit-tls-prod` (out of scope, same as video-calls). |

## Out of Scope / Follow-ups

| Feature | Reason | Future change |
|---|---|---|
| **Recording / egress webhooks** | The route handler returns 200 OK no-op for `egress_*` and `track_*` events. The infrastructure (dedupe + dispatch by event name) is in place to add real handling in a follow-up. | "livekit-recording" |
| **`doctor-marks-completed-ux`** (UX simplification) | Doctors no longer need to click "Completar" after every call. The UX can be simplified (e.g., the call page header changes from "Call in progress" to "Call ended — auto-completed" after both leave). Out of MVP because it's a UX redesign that doesn't change the domain rules. | "call-page-ux-redesign" |
| **`livekit-tls-prod`** | TLS certs, production TURN, proper domain instead of `host.docker.internal`. The webhook handler is the same in prod; only the LiveKit config block changes. | "livekit-tls-prod" (pre-existing follow-up from video-calls) |
| **`livekit-turn-prod`** | Production TURN server (coturn) for restrictive NAT networks. | "livekit-turn-prod" (pre-existing follow-up from video-calls) |
| **Pin the `livekit-server` image digest** | Currently `latest`; production should pin to a digest. Documented as accepted risk in the infra spec delta. | "livekit-pin-image" (pre-existing follow-up from video-calls) |
| **Webhook eventing to external systems** | Slack/email notification on `room_finished`. The audit log is the local source of truth; external notifications are a separate concern. | "cita-eventing" |
| **Per-modality audit on cita creation** | A `CITA_CREADA` row in `audit_logs` already exists; the `modalidad` is in the cita row, not the audit row. Not a gap. | not planned |
| **`updateAppointmentStatusUseCase` extension to skip the doctor check** | A doctor-actor path that bypasses the doctor check could be added, but the webhook uses a system actor (different audit), and the human path is already covered. Two paths, different actors. | not planned — kept separate for actor clarity (AD-9) |
| **LiveKit room name in the cita row** | The `citas.livekit_room_name` column exists but is unused; the `Cita.livekitRoomName` getter derives it. The webhook handler uses the derivation to look up the cita. Writing the column would be a small win for debugging but not a correctness issue. | "livekit-room-name-persistence" |
| **Doctor-side notification when webhook auto-completes** | A real-time notification (e.g., toast) when the cita auto-completes. The doctor's next page load will show the new state; real-time requires WebSocket or polling. | "doctor-cita-realtime" |
| **Multi-tenant webhook secret rotation** | The `LIVEKIT_API_SECRET` is a single env var. Rotating it would require the receiver to accept BOTH old and new signatures for a window. Out of MVP; single-secret is fine for self-hosted. | "livekit-secret-rotation" |

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | **Forged webhooks** — a determined attacker could send a `room_finished` event with a crafted room name to force a cita into `COMPLETADA` or `NO_ASISTIO`. | Medium | High | (a) `WebhookReceiver` validates the JWT signature using `LIVEKIT_API_SECRET`; without the secret the signature cannot be forged. (b) The endpoint is NOT publicly signed-in via Auth.js — it relies entirely on the signature. (c) The handler returns 401 on signature failure; the use case is never invoked. **Verdict: mitigated.** |
| **R2** | **Replay attacks** — LiveKit re-delivers the same event on transient failure. | Medium | Medium | (a) Redis-backed `event.id` dedupe (D4). (b) The handler returns 200 OK for re-deliveries without re-running the side effect. (c) Even if Redis is unreachable, the state machine is itself idempotent (terminal states are no-ops, the optimistic UPDATE catches races). **Verdict: mitigated.** |
| **R3** | **Out-of-order events** — `room_finished` arrives before `room_started` (or before the cita reaches `EN_CURSO`). | Low | Low | (a) LiveKit guarantees in-order delivery per room. (b) The handler's no-op rules (D6) cover the edge cases: `CONFIRMADA` and `PENDIENTE` are explicit no-ops. **Verdict: accepted risk, documented in D8.** |
| **R4** | **Webhook arrives AFTER doctor manually cancelled** — the doctor clicks "Cancelar" while the patient is still in the call; the patient leaves; `room_finished` arrives; the handler looks up the cita — it's `CANCELADA`. | Medium | Low | (a) Terminal-state no-op (D6): `CANCELADA` is in the no-op list. (b) The handler returns 200 OK; no state change; no audit. **Verdict: mitigated.** |
| **R5** | **Self-hosted LiveKit not configured to send webhooks** (HIGH until this change ships). The container currently runs with `--dev` only, no `webhook:` block. | High | High | (a) D11: `livekit.yaml` + docker-compose change ship in the same PR as the handler. (b) The PR's success criteria include a smoke test that the container actually delivers a webhook (verified by hitting the route handler in dev). (c) The infra spec delta makes the config REQUIRED. **Verdict: mitigated by the same change.** |
| **R6** | **`audit_logs.usuario_id` not nullable** — the schema requires a real user; the webhook handler cannot write an audit row without one. | High (today) | High | (a) D9: nullable migration is the first step in the apply phase. (b) The migration is forward-and-back clean. (c) The down-migration fails if any NULL rows exist; the test asserts no NULLs are written by any non-webhook code path. **Verdict: mitigated by D9.** |
| **R7** | **`getRoomToken` creates `livekit_room_name` for ALL citas** — backwards-compat issue with the webhook lookup. | None | None | (a) The `livekitRoomName` getter always returns `cita-${uuid}` regardless of modality. (b) The column is never written to. (c) The webhook handler reads by `citas.id` (extracted from the room name via regex), not by the column. **Verdict: not a risk; documented in explore § 6 R7.** |
| **R8** | **`host.docker.internal` on Linux** — Mac/Windows Docker Desktop works out of the box; Linux requires `extra_hosts`. | Medium | Medium | (a) `extra_hosts: - "host.docker.internal:host-gateway"` added defensively in docker-compose.yml (D11, AD-14). (b) The caveat is documented in `docs/livekit.md`. **Verdict: mitigated.** |
| **R9** | **`livekit-server` image digest drift** — the image is `latest` (rolling tag); a major version bump could change the webhook payload shape. | Low | Low | (a) The SDK is pinned to `2.15.4`; the payload is validated against the SDK types. (b) Documented in the infra spec delta. (c) Pinning the image is deferred to `livekit-pin-image` (pre-existing follow-up). **Verdict: accepted risk, same as the existing setup.** |
| **R10** | **PR exceeds the 800-line cap** — the change has 7 new files + 12 modified files; if the actual diff comes in over 800 lines, the apply phase must split. | Medium | Low | (a) D10 documents the split plan (PR-1 infra + PR-2 domain, stacked-to-main). (b) The natural seam exists; the split is mechanical. (c) The apply phase tracks line count and splits BEFORE pushing if needed. **Verdict: mitigated by plan.** |
| **R11** | **Doctor and webhook race on `EN_CURSO → COMPLETADA`** — doctor clicks "Completar" at the exact moment the webhook fires for `room_finished`. | Medium | Medium | (a) Optimistic UPDATE WHERE clause (D6) — exactly one transition wins; the loser is a 200 OK no-op. (b) Audit row is written by the winner only (use case checks `rowCount === 1`). (c) No distributed lock needed. **Verdict: mitigated by D6, AD-7.** |
| **R12** | **Webhook arrives BEFORE the cita reaches `EN_CURSO`** — patient joins before doctor clicks "Iniciar consulta"; both leave; `room_finished` arrives while cita is still `CONFIRMADA`. | Low | Low | (a) `CONFIRMADA` is in the no-op list (D6). (b) The doctor can still start the consulta manually; the call already happened. (c) The audit log does NOT record this as auto-completion because the state didn't change. **Verdict: accepted, documented in D6.** |

## Rollback Plan

1. **Revert the route handler** (`src/app/api/livekit/webhook/route.ts` deletion). No effect on the rest of the app — the route was not yet reachable in production before this change.
2. **Revert the docker-compose change** (remove `volumes:`, drop `--config` flag, drop `extra_hosts`). The container falls back to `--dev --bind 0.0.0.0` (pre-change behavior). The webhook is silently disabled (matches the pre-change state).
3. **Revert the use case** (`auto-complete-on-room-finished.use-case.ts` deletion). No effect — nothing else called it.
4. **Revert the audit union extension** (`'CITA_AUTO_COMPLETED_BY_WEBHOOK'` removal from the `AuditAction` union). Any test fixture that referenced the new action must be reverted too.
5. **Revert the `0005` migration** (`ALTER TABLE audit_logs ALTER COLUMN usuario_id SET NOT NULL`). The down-migration fails if any NULL rows exist; the test asserts no NULLs are written by any non-webhook code path, so the down-migration succeeds. The `writeAuditLogUseCase` input type narrows back to `string`.
6. **Revert the D10 footer removal** — re-add the limitation footer to `src/app/citas/[id]/llamada/page.tsx`. The call page returns to the pre-change state (doctor manually completes the cita).
7. **Revert the spec deltas** — the 4 delta specs are removed from `openspec/changes/2026-06-19-livekit-webhooks/`. The canonical `openspec/specs/livekit-infrastructure/spec.md`, `video-calls-api/spec.md`, `booking-api/spec.md`, `video-calls-ui/spec.md` are untouched (they were never updated; only the deltas reference the new requirements).

**No destructive operations.** Every change is additive. The `0005` migration's down is the only destructive step, and it's reversible (the test asserts no NULL rows were written by non-webhook code paths).

## PR Split Recommendation

Per D10, this change ships as **a single PR**. If the actual diff exceeds 800 lines, split into chained (stacked-to-main):

### Single PR (~800 lines) — preferred when at the cap

**Diff scope:**

- DB: `0005` migration + `audit-logs.ts` schema change
- Infra: `docker/dev/livekit.yaml`, `docker-compose.yml` change, `.env.example`, `.env.local.example`
- Infra/SDK: `LiveKitServerClient.verifyWebhook` extension
- Infra/Redis: `webhookDedupe` helper
- HTTP: route handler
- Domain: `autoCompleteOnRoomFinishedUseCase`, `AuditAction` union extension, `writeAuditLogUseCase` type widening
- UI: D10 footer removal + test extension
- Docs: `docs/livekit.md` Webhooks section + D10 paragraph removal
- Specs: 4 deltas (`livekit-infrastructure`, `video-calls-api`, `booking-api`, `video-calls-ui`)
- Tests: 4 new test files (route, dedupe, verifyWebhook, use case) + 2 test extensions (migration, call page footer)

**Why single PR is preferred:** the infra + domain are tightly coupled (the route handler calls the use case; the use case writes to the audit log that the migration makes nullable). A forced split would mean PR-1 leaves a half-working system (the route exists but logs to nowhere or throws because `usuario_id` is still NOT NULL). At 800 lines exactly, single PR is the cleanest delivery.

**Chain context (for the single PR):**
- **Start state:** pre-change (no webhook receiver, `audit_logs.usuario_id` is NOT NULL, D10 footer present, cita can stay in `EN_CURSO` indefinitely).
- **End state:** webhook receiver works end-to-end; cita auto-completes on `room_finished`; D10 footer removed; `audit_logs.usuario_id` is nullable; system-actor audit rows are written.
- **Prior dependencies:** none (this PR stands alone).
- **Follow-up work:** none within this change.
- **Out of scope:** recording/egress webhooks, doctor-marks-completed-ux, `livekit-tls-prod`, `livekit-turn-prod`.

### PR-1 (infra, ~400 lines) — soft exception if single PR goes over cap

**Diff scope:**

- Infra: `docker/dev/livekit.yaml`, `docker-compose.yml` change, `.env.example`, `.env.local.example`
- Infra/SDK: `LiveKitServerClient.verifyWebhook` extension + unit test
- Infra/Redis: `webhookDedupe` helper + unit test
- HTTP: route handler + integration test
- Specs: 2 deltas (`livekit-infrastructure`, partial `video-calls-api` — webhook receiver contract only)
- Docs: `docs/livekit.md` Webhooks section

**Why PR-1 is independently shippable:** the route exists and is reachable, but does nothing meaningful until PR-2 lands (the use case doesn't exist). The CI suite proves the route compiles and the dedupe helper works in isolation. No production behavior change yet.

### PR-2 (domain, ~400 lines) — stacks on PR-1

**Diff scope:**

- DB: `0005` migration + `audit-logs.ts` schema change + migration test
- Domain: `autoCompleteOnRoomFinishedUseCase` + unit test, `AuditAction` union extension, `writeAuditLogUseCase` type widening
- UI: D10 footer removal + test extension
- Specs: 2 deltas (rest of `video-calls-api`, `booking-api` forward pointer, `video-calls-ui` D10 removal)

**Why PR-2 depends on PR-1:** the use case is called by the route handler that PR-1 created; without PR-1, the use case has no caller. The `audit_logs.usuario_id` migration is in PR-2 because it's the schema change that makes the use case writeable.

### Dependency diagram (for the soft-exception case)

```
PR-1 ────► main  (merge PR-1 first: infra + route + dedupe)
             │
             └──► PR-2 ────► main  (stack PR-2 on PR-1: use case + audit + migration)
```

## Review Workload Forecast

The user's cached D2 budget is **800 lines per PR**. The canonical `chained-pr` skill threshold is **400 lines**. The forecast:

| PR | Estimated lines | User budget (800) | Canonical budget (400) | Verdict |
|---|---|---|---|---|
| **Single PR** | ~800 | At cap | Over by ~400 | Single PR is preferred; chained split is the safety net. The change has a clean infra/domain seam, so the split is mechanical IF the actual count comes in over. Document the soft exception (D10). |
| **PR-1 (infra, soft exception)** | ~400 | Under | At cap | Independently shippable. The canonical threshold is honored exactly. |
| **PR-2 (domain, soft exception)** | ~400 | Under | At cap | Stacks on PR-1. The canonical threshold is honored exactly. |

**Recommendation: single PR per D10, AD-12.** At ~800 lines exactly, single PR is preferred. The chained-PR split is documented as a safety net; if the actual diff comes in over 800, the apply phase splits BEFORE pushing.

The canonical 400-line cap is exceeded by the single PR, but this matches the precedent set by video-calls and modality-toggle (both shipped at the user cap, both used the 400-line cap as a "soft exception" guideline). The apply phase tracks line count during implementation and calls out the split before pushing if the cap is exceeded.

## Decision Needed Before Apply

None. All 11 default decisions (D1–D11) are committed. All 7 user-confirmed open questions (OQ1=COMPLETADA-if-joined / NO_ASISTIO-if-zero, OQ2=idempotent-no-op, OQ3=SDK, OQ4=no new columns, OQ5=optimistic-locking, OQ6=defensive-ignore, OQ7=yes-to-nullable-migration) are resolved with defaults. The user authorized auto mode (D10=single-PR default confirmed). The spec, design, and apply phases can begin.

## Success Criteria

- [ ] `audit_logs.usuario_id` is nullable after `0005` migration applies; the down-migration succeeds (test asserts no NULL rows were written by non-webhook code paths).
- [ ] `LiveKitServerClient.verifyWebhook(rawBody, authHeader)` returns a parsed `WebhookEvent` for a valid signature, throws on invalid signature, throws on missing auth header, throws on expired token.
- [ ] `POST /api/livekit/webhook` with a valid signature returns 200 OK; invalid signature returns 401; malformed JSON returns 400; non-`room_finished` events return 200 no-op.
- [ ] `POST /api/livekit/webhook` for a `room_finished` event with an ONLINE cita + ≥1 participant transitions the cita to `COMPLETADA` and writes a `CITA_AUTO_COMPLETED_BY_WEBHOOK` audit row with `detalles: { eventId, roomName, participantCount, finalState: "COMPLETADA" }`.
- [ ] Same as above but with 0 participants → cita transitions to `NO_ASISTIO`; audit `detalles.finalState: "NO_ASISTIO"`.
- [ ] PRESENCIAL cita + `room_finished` → no state change, no audit row, warning logged.
- [ ] Terminal-state cita (`COMPLETADA` / `CANCELADA` / `NO_ASISTIO`) + `room_finished` → no state change, no audit row, 200 OK returned.
- [ ] `CONFIRMADA` cita + `room_finished` → no state change (doctor hasn't started), no audit row, 200 OK returned.
- [ ] Doctor manually clicks "Completar" while webhook is in-flight → exactly one transition wins (doctor or webhook); the loser returns 200 OK no-op. No double-audit, no double-transition.
- [ ] Replay of a dedupe'd event returns 200 OK without re-invoking the use case.
- [ ] `webhookDedupe` returns `{ isNew: true }` on first delivery, `{ isNew: false }` on replay within 24h, `{ isNew: true }` when Redis is unreachable (degrade-open).
- [ ] `docker-compose.yml` `livekit` service mounts `docker/dev/livekit.yaml` at `/etc/livekit.yaml`, runs with `--config /etc/livekit.yaml`, has `extra_hosts: host.docker.internal:host-gateway`.
- [ ] `LIVEKIT_WEBHOOK_URL` env var is documented in `.env.example` and `.env.local.example` with the dev default.
- [ ] D10 footer is REMOVED from `src/app/citas/[id]/llamada/page.tsx`; the call page test asserts the footer is NOT rendered.
- [ ] `docs/livekit.md` has a "Webhooks" section explaining the events we handle, the `livekit.yaml` shape, the `host.docker.internal` Linux caveat, and the audit log side-effect; the D10 limitation paragraph is removed.
- [ ] All 4 new test files (route, dedupe, verifyWebhook, use case) pass; the 2 test extensions (migration, call page footer) pass; `pnpm test:run` and `pnpm test:integration` are green.
- [ ] `pnpm type-check` and `pnpm lint` are green.
- [ ] The change ships in 1 PR (single-PR preferred) or 2 chained PRs (stacked-to-main) if the diff exceeds 800 lines; the canonical 400-line cap is honored exactly in the chained case.

## Next Steps

1. **Spec** (`sdd-spec`): Write 4 delta specs. The contract is the § "Capabilities" section above. Each delta is small (1-3 scenarios per spec) and stays inside the existing capability tree.
2. **Design** (`sdd-design`): Technical design covering the `livekit.yaml` shape and docker-compose change (D11), the `webhookDedupe` Redis primitive (D4), the route handler's signature-verification → idempotency → dispatch pipeline (D1-D5), the `autoCompleteOnRoomFinishedUseCase` orchestration and optimistic-locking SQL (D6, D7, D9), the `audit_logs.usuario_id` migration forward and back (D9), and the D10 footer removal.
3. **Tasks** (`sdd-tasks`): Break into task lists, each task mapped to a work unit (per `work-unit-commits` skill). Single-PR task list if the diff fits in 800 lines; split into PR-1 + PR-2 task lists if it doesn't.
4. **Apply** (`sdd-apply`): Implement the single PR. Track line count during implementation; split into chained PRs BEFORE pushing if the cap is exceeded.
5. **Verify** (`sdd-verify`): Prove implementation matches the 4 delta specs. Smoke-test the webhook end-to-end in dev: start the container, create an ONLINE cita, have both parties join and leave, assert the cita transitions to `COMPLETADA` and the audit row is written. Smoke-test the replay path: re-deliver the same event, assert no-op. Smoke-test the race path: doctor clicks "Completar" while webhook fires, assert exactly one transition wins.
6. **Archive** (`sdd-archive`): Sync the 4 delta specs into the canonical `openspec/specs/` tree. The archive report MUST call out (a) D10 RESOLVED in `video-calls-ui/spec.md`, (b) the `audit_logs.usuario_id` nullable migration as the only schema change, and (c) the soft exception on the 800-line cap (so the next reviewer scanning the diff sees them).

## References

- **SDD Explore report** — engram id `465`, topic `sdd/livekit-webhooks-2026-06-19/explore`, project `medico-consulta`, scope `project`. Saved 2026-06-19 19:00:17.
- **Style template (most recent)** — `openspec/changes/archive/2026-06-19-modality-toggle/proposal.md` (the deeper table-driven structure this proposal follows; also the precedent for chained-PR splits and 800-line budget).
- **Style template (foundational)** — `openspec/changes/archive/2026-06-16-video-calls/proposal.md` (the change that shipped `LiveKitServerClient`, `getRoomToken`, `JoinCallButton`, the `livekit` Docker service, and the D10 limitation we are now resolving).
- **Chained-PR skill** — `~/.config/opencode/skills/chained-pr/SKILL.md` (stacked-to-main strategy, dependency diagrams, Chain Context sections, 400-line canonical cap, 60-minute review budget).
- **Work-unit-commits skill** — `~/.config/opencode/skills/work-unit-commits/SKILL.md` (commit-by-work-unit, keep tests with code, future PR-ready).
- **Existing `LiveKitServerClient`** — `src/infrastructure/livekit/livekit-server.ts` (the 80-line wrapper we add `verifyWebhook` to).
- **Existing Redis module** — `src/infrastructure/redis/cache.ts` and `src/infrastructure/redis/index.ts` (the helper we extend with `webhookDedupe`).
- **Existing `audit_logs` schema** — `src/infrastructure/db/schema/audit-logs.ts` (the `notNull` we drop via migration `0005`).
- **Existing audit union** — `src/application/use-cases/audit/write-audit-log.use-case.ts` (the union we extend with `'CITA_AUTO_COMPLETED_BY_WEBHOOK'`).
- **Existing call page** — `src/app/citas/[id]/llamada/page.tsx` (the page we remove the D10 footer from).
- **Existing LiveKit docs** — `docs/livekit.md` (the doc we add the "Webhooks" section to and remove the D10 limitation paragraph from).
- **Existing docker-compose** — `docker-compose.yml` lines 77-90 (the `livekit` service block we add `volumes`, `--config`, and `extra_hosts` to).
- **Modality-toggle archived change** — `openspec/changes/archive/2026-06-19-modality-toggle/` (the immediate predecessor; provides `citas.modalidad`, `ConsultaModalidad`, and the `getRoomToken` modality gate the webhook relies on).
- **Video-calls archived change** — `openspec/changes/archive/2026-06-16-video-calls/` (the foundation this change builds on; in particular the `LiveKitServerClient`, the `getRoomTokenUseCase`, the `livekit` Docker service, the `livekit_room_name` column, the `Cita.livekitRoomName` getter, and the D10 limitation we resolve here).
- **LiveKit webhooks docs** — `https://docs.livekit.io/home/server/webhooks/` (the contract this change implements: `room_finished` event shape, JWT signature, retry semantics, in-order delivery guarantee).
