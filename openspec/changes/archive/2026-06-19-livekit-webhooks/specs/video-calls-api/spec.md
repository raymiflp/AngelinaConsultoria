# Delta for Video Calls API

## LIVEKIT WEBHOOKS ADDITIONS (2026-06-19)

The following requirements are ADDED to the video-calls-api spec by the `2026-06-19-livekit-webhooks` change. They close the D10 limitation: a cita stays in `EN_CURSO` indefinitely when both participants leave the LiveKit room without clicking "Completar" or "No asistio". The webhook receiver (`POST /api/livekit/webhook`) is a Next.js route handler, NOT a tRPC procedure (the trust boundary sits outside the tRPC schema — AD-1 / D2). The new use case `autoCompleteOnRoomFinishedUseCase` is internal — NOT exposed via tRPC, NOT callable from the SPA (AD-9). Together they automate the `EN_CURSO → COMPLETADA / NO_ASISTIO` transition that previously required manual doctor action. **D10 is RESOLVED.**

### Requirement: REQ-VCA-WH-1 — Webhook Endpoint

The system MUST expose a Next.js App Router POST handler at `src/app/api/livekit/webhook/route.ts` (NOT under `/api/trpc/`). The handler MUST:

1. Read the raw body via `await req.text()` (NOT `req.json()` — the JWT signature hashes the exact bytes, parse-and-restringify breaks the hash; AD-3).
2. Call `LiveKitServerClient.verifyWebhook(rawBody, req.headers.get('authorization'))`, which wraps `new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).receive(rawBody, authHeader)` from `livekit-server-sdk@2.15.4` (D1, AD-2). Throws on signature mismatch or missing header.
3. Call `webhookDedupe(event.id)` BEFORE dispatch. Returns `{ isNew: true }` first time, `{ isNew: false }` on replay (Redis `SET livekit:webhook:${eventId} 1 NX EX 86400`; D4). On `{ isNew: false }` the handler MUST return 200 OK without dispatching.
4. Switch on `event.event`. On `room_finished` dispatch to `autoCompleteOnRoomFinishedUseCase` (REQ-VCA-WH-2). On any other event (`room_started`, `participant_joined`, `participant_left`, `track_*`, `egress_*`, `ingress_*`) return 200 OK immediately, no dispatch (D5).
5. Return `200 OK` on success, `401` on signature failure, `400` on malformed JSON. All other error paths return 200 OK so LiveKit stops retrying — only signature failure returns non-2xx.

#### Scenario: Valid signature returns 200 and dispatches room_finished

- GIVEN a valid `room_finished` event with a valid JWT signature
- WHEN `POST /api/livekit/webhook` is called with the raw body and `Authorization: <JWT>`
- THEN the handler MUST verify the signature via `WebhookReceiver`
- AND MUST call `webhookDedupe(event.id)` and receive `{ isNew: true }`
- AND MUST dispatch to `autoCompleteOnRoomFinishedUseCase`
- AND MUST return `200 OK`

#### Scenario: Invalid signature returns 401 and does not dispatch

- GIVEN a `room_finished` event with a tampered JWT signature
- WHEN `POST /api/livekit/webhook` is called
- THEN `LiveKitServerClient.verifyWebhook` MUST throw
- AND the handler MUST return `401 Unauthorized`
- AND the use case MUST NOT be invoked
- AND NO `audit_logs` row MUST be written

#### Scenario: Dedupe hit returns 200 without re-dispatching

- GIVEN a `room_finished` event whose `event.id` was already processed (Redis key `livekit:webhook:${eventId}` exists)
- WHEN `POST /api/livekit/webhook` is called again with the same event
- THEN `webhookDedupe(event.id)` MUST return `{ isNew: false }`
- AND the handler MUST return `200 OK`
- AND the use case MUST NOT be invoked
- AND NO new `audit_logs` row MUST be written

#### Scenario: Dedupe miss dispatches on first delivery

- GIVEN a fresh `room_finished` event with a new `event.id`
- WHEN `POST /api/livekit/webhook` is called
- THEN `webhookDedupe(event.id)` MUST return `{ isNew: true }`
- AND the handler MUST proceed to dispatch the use case

### Requirement: REQ-VCA-WH-2 — Auto-Completion Use Case

The system MUST provide an internal use case `autoCompleteOnRoomFinishedUseCase(db, event)` that orchestrates the `room_finished` → state transition pipeline. The use case is NOT exposed via tRPC and NOT callable from the SPA — only the webhook route handler invokes it (AD-9).

Sequence (each step returns success-no-op on failure except step 7, which is the write):

1. Parse the cita UUID from `event.room.name` via regex `/^cita-([0-9a-f-]{36})$/` (mirrors `Cita.livekitRoomName` derivation). On regex mismatch: log warn, return no-op.
2. Load cita by id. If missing (stale room from a deleted cita): log warn with the UUID, return no-op.
3. If `cita.modalidad === 'PRESENCIAL'`: log warn with cita id and modality, return no-op WITHOUT an audit row (D7 — defensive ignore).
4. If estado is `PENDIENTE` / `CONFIRMADA` (call hasn't started) or terminal (`COMPLETADA` / `CANCELADA` / `NO_ASISTIO`): return no-op without an audit row (D6 idempotent branch).
5. Read `participantCount` from `event.room.num_participants` (or `event.participant?.joined_count`, to be confirmed in design). Threshold: `>= 1` → target `COMPLETADA`; `=== 0` → target `NO_ASISTIO`.
6. Run the atomic optimistic UPDATE:

   ```sql
   UPDATE citas SET estado = $1, updated_at = NOW()
   WHERE id = $2 AND estado = 'EN_CURSO';
   ```

   `rowCount === 0` means "doctor beat us to it" — return no-op WITHOUT an audit row. `rowCount === 1` proceeds to step 7.
7. Write one `audit_logs` row: `usuarioId: null` (system actor), `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'` (new `AuditAction` value, D9), `entidadAfectada: 'citas'`, `entidadId: <citaId>`, `detalles: { eventId: event.id, roomName: event.room.name, participantCount: <n>, finalState: 'COMPLETADA' | 'NO_ASISTIO' }`. `eventId` makes the audit row traceable to the exact LiveKit event (AD-11).

The `transitionStatus()` helper MUST keep enforcing `EN_CURSO → {COMPLETADA, NO_ASISTIO}` as the valid transition — adding new transitions is out of scope.

#### Scenario: PRESENCIAL cita is defensively ignored

- GIVEN a `room_finished` event whose `event.room.name` matches a cita with `modalidad === 'PRESENCIAL'`
- WHEN the webhook handler dispatches `autoCompleteOnRoomFinishedUseCase`
- THEN the use case MUST log `console.warn` with the cita id and modality
- AND MUST NOT modify `citas.estado`
- AND MUST NOT write an `audit_logs` row
- AND MUST return success-no-op (handler returns 200 OK to LiveKit)

#### Scenario: ONLINE cita with >=1 participant transitions to COMPLETADA

- GIVEN a `room_finished` event for an ONLINE cita in `EN_CURSO` with `participantCount >= 1`
- WHEN the use case runs
- THEN the optimistic UPDATE MUST match exactly one row (`rowCount === 1`)
- AND `citas.estado` MUST become `'COMPLETADA'`
- AND an `audit_logs` row MUST be written with `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'`, `usuarioId: null`, `detalles.finalState: 'COMPLETADA'`, `detalles.eventId: <event.id>`, `detalles.participantCount: <n>`, `detalles.roomName: 'cita-<uuid>'`

#### Scenario: ONLINE cita with 0 participants transitions to NO_ASISTIO

- GIVEN a `room_finished` event for an ONLINE cita in `EN_CURSO` with `participantCount === 0`
- WHEN the use case runs
- THEN the optimistic UPDATE MUST match exactly one row
- AND `citas.estado` MUST become `'NO_ASISTIO'`
- AND an `audit_logs` row MUST be written with `detalles.finalState: 'NO_ASISTIO'`

#### Scenario: Terminal-state cita is a no-op (idempotent)

- GIVEN a `room_finished` event for a cita already in `COMPLETADA` (or `CANCELADA` or `NO_ASISTIO`)
- WHEN the use case runs
- THEN the optimistic UPDATE MUST match zero rows (`rowCount === 0`)
- AND `citas.estado` MUST remain the existing terminal state
- AND NO new `audit_logs` row MUST be written
- AND the handler MUST return 200 OK
