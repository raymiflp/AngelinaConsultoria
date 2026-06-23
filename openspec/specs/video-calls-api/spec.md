# Video Calls API Specification

## Purpose

Define the server-side surface that lets a doctor or patient join the in-platform video consultation for a `Cita`. The video call is a capability that becomes available while the cita is in `EN_CURSO` or within a short pre-window of `CONFIRMADA`. This spec covers the new tRPC procedure `bookings.getRoomToken`, its authorization model, the status and time-window gates, the token issuance, and the audit log entry. It does NOT cover the call page UI (see `video-calls-ui`) or the LiveKit runtime (see `livekit-infrastructure`).

## Requirements

### Requirement: getRoomToken Procedure

The system MUST expose a protected tRPC query procedure `getRoomToken` on the existing `bookings` router (`src/infrastructure/api/routers/bookings.ts`). The procedure MUST be declared as `protectedProcedure.input(z.object({ citaId: z.string().uuid() })).query(...)` — NOT a new router. The procedure MUST NOT be reachable by anonymous callers (the `protectedProcedure` middleware enforces this).

The procedure MUST accept a single input `citaId: string` (UUID v4 format) and MUST return an object with exactly three fields:

```ts
{
  token: string;          // LiveKit JWT, min length 1
  serverUrl: string;      // ws:// or wss:// URL, valid URL
  roomName: string;       // matches /^cita-[0-9a-f-]{36}$/ (lowercase hex + dashes)
}
```

The procedure MUST delegate all authorization, status, and time-window logic to a new use case `getRoomTokenUseCase(db, { citaId, actor: { id: ctx.session.user.id, role: ctx.session.user.role } })` — the procedure body is a thin wire adapter.

#### Scenario: Procedure is registered on the bookings router

- GIVEN the change is applied
- WHEN `src/infrastructure/api/routers/bookings.ts` is inspected
- THEN a `getRoomToken: protectedProcedure.input(...).query(...)` procedure MUST be present
- AND no separate `videoCallsRouter` SHALL exist

#### Scenario: Anonymous request rejected

- GIVEN no active session
- WHEN `api.bookings.getRoomToken({ citaId })` is called
- THEN the procedure MUST reject with `UNAUTHORIZED`
- AND the use case MUST NOT be invoked

#### Scenario: Successful call returns the three fields

- GIVEN a PACIENTE authenticated against a CONFIRMADA cita
- WHEN `getRoomToken({ citaId })` is called and the gates pass
- THEN the response MUST contain `token` (non-empty string), `serverUrl` (valid URL), and `roomName` (matching `/^cita-[0-9a-f-]{36}$/`)

#### Scenario: Invalid input rejected

- GIVEN a `citaId` that is not a UUID
- WHEN `getRoomToken` is called
- THEN the procedure MUST reject with `BAD_REQUEST` (zod validation)

### Requirement: Authorization and Existence Check

The use case MUST look up the `Cita` by `citaId`. If the cita does not exist, the use case MUST throw `TRPCError({ code: 'NOT_FOUND' })`. The use case MUST resolve the actor's role in the cita by querying `doctores.usuario_id` and `pacientes.usuario_id`. If the actor is neither the cita's doctor nor the cita's patient, the use case MUST throw `TRPCError({ code: 'NOT_FOUND' })` — `NOT_FOUND` is used (not `FORBIDDEN`) on purpose, to avoid leaking whether the cita exists to non-participants. The `FORBIDDEN` code is reserved for the status and time-window gates below, where the actor is confirmed to be a participant.

The use case MUST NOT use a different error code or message for "not found" and "not authorized" cases — both MUST return `NOT_FOUND` with the same shape so a non-participant cannot probe cita existence.

#### Scenario: Non-participant receives NOT_FOUND

- GIVEN an authenticated user who is neither the doctor nor the patient of the cita
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'NOT_FOUND' })`
- AND the response shape MUST match the `NOT_FOUND` used for non-existent citas

#### Scenario: Non-existent cita returns NOT_FOUND

- GIVEN a UUID that does not correspond to any cita row
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'NOT_FOUND' })`
- AND the error shape MUST be identical to the non-participant case above

#### Scenario: Doctor of the cita passes authorization

- GIVEN a DOCTOR whose `usuarioId` matches the cita's `doctor.usuarioId`
- WHEN `getRoomToken({ citaId })` is called
- THEN the authorization check MUST pass (the next gate is evaluated)

#### Scenario: Patient of the cita passes authorization

- GIVEN a PACIENTE whose `usuarioId` matches the cita's `paciente.usuarioId`
- WHEN `getRoomToken({ citaId })` is called
- THEN the authorization check MUST pass (the next gate is evaluated)

### Requirement: Status and Time-Window Gate

Once the actor is confirmed as a participant, the use case MUST enforce the status and time-window gate. The token is issued only when ONE of these conditions is true:

1. `cita.estado === 'EN_CURSO'`, OR
2. `cita.estado === 'CONFIRMADA'` AND `Math.abs(Date.now() - cita.fechaHora.getTime()) <= 15 * 60 * 1000`

Anything else MUST throw `TRPCError({ code: 'FORBIDDEN' })` with a Spanish message. The message MUST vary by the failing case:

- `PENDIENTE` → `"La cita debe estar confirmada antes de unirse a la videollamada."`
- `CONFIRMADA` outside the window → `"La videollamada se habilita 15 minutos antes de la hora de la cita."`
- `COMPLETADA` / `CANCELADA` / `NO_ASISTIO` → `"Esta cita ya no permite unirse a una videollamada."`

The time window is symmetric: the actor may join up to 15 minutes before OR 15 minutes after the scheduled `fechaHora`. The window is `Math.abs(...)` to keep the rule symmetric without a separate "grace period" code path.

#### Scenario: PENDIENTE cita rejected

- GIVEN a cita with `estado === 'PENDIENTE'`
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'La cita debe estar confirmada antes de unirse a la videollamada.' })`

#### Scenario: CONFIRMADA cita 30 minutes in the future is rejected

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 30 minutes in the future
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'La videollamada se habilita 15 minutos antes de la hora de la cita.' })`

#### Scenario: CONFIRMADA cita 5 minutes in the future is accepted

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 5 minutes in the future
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST return a token (the time-window check passes)

#### Scenario: CONFIRMADA cita 10 minutes in the past is accepted

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 10 minutes in the past
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST return a token (the symmetric window covers late joiners)

#### Scenario: EN_CURSO cita is accepted regardless of time

- GIVEN a cita with `estado === 'EN_CURSO'`
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST return a token (the time check is bypassed for `EN_CURSO`)

#### Scenario: COMPLETADA cita rejected

- GIVEN a cita with `estado === 'COMPLETADA'`
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'Esta cita ya no permite unirse a una videollamada.' })`

#### Scenario: CANCELADA and NO_ASISTIO rejected

- GIVEN a cita with `estado === 'CANCELADA'` (and separately `NO_ASISTIO`)
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'Esta cita ya no permite unirse a una videollamada.' })`

### Requirement: Token Issuance

The use case MUST build a `LiveKitServerClient` instance from the infrastructure layer (`src/infrastructure/livekit/livekit-server.ts`). The wrapper MUST read `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from the environment at module load time. If either is missing, the module MUST throw a clear `Error` at boot — NOT per-request — with the message: `"LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. See docs/livekit.md for setup."`

The use case MUST issue a token with these exact properties:

- `identity` = `"${actor.role.toLowerCase()}-${actor.id}"` (e.g. `"doctor-<uuid>"` or `"paciente-<uuid>"`)
- `room` = `"cita-${citaId}"`
- `roomJoin: true`
- `canPublish: true`
- `canSubscribe: true`
- `canPublishData: false` (in-call chat is out of scope)
- `ttl` = `"1h"`

The use case MUST return `{ token, serverUrl: env.NEXT_PUBLIC_LIVEKIT_URL, roomName: \`cita-${citaId}\` }`. The `serverUrl` is whatever the env var carries (`ws://localhost:7880` in dev, `wss://...` in production — out of MVP).

#### Scenario: Token identity is role-prefixed

- GIVEN a DOCTOR actor with id `abc-123`
- WHEN a token is issued for a cita
- THEN the token's `identity` claim MUST be `"doctor-abc-123"` (case-insensitive on the role prefix)

#### Scenario: Token identity for patient is paciente-prefixed

- GIVEN a PACIENTE actor with id `xyz-789`
- WHEN a token is issued for a cita
- THEN the token's `identity` claim MUST be `"paciente-xyz-789"`

#### Scenario: Room name matches the cita-${uuid} pattern

- GIVEN a cita with id `8d2a1f8e-2b1c-4f00-aaaa-000000000001`
- WHEN a token is issued
- THEN the token's `room` claim MUST be `"cita-8d2a1f8e-2b1c-4f00-aaaa-000000000001"`
- AND the response `roomName` MUST equal the `room` claim
- AND `roomName` MUST match the regex `/^cita-[0-9a-f-]{36}$/`

#### Scenario: Grants include canPublish and canSubscribe

- GIVEN any valid token issuance
- WHEN the token is decoded
- THEN the `video` grant MUST be `room: true` (or `roomJoin: true`)
- AND the `canPublish` grant MUST be `true`
- AND the `canSubscribe` grant MUST be `true`
- AND the `canPublishData` grant MUST be `false` (chat is disabled by default)

#### Scenario: Token TTL is 1 hour

- GIVEN any valid token issuance
- WHEN the token is decoded
- THEN the `exp` claim MUST be at most 3600 seconds (1h) after the `iat` claim

#### Scenario: Missing env vars fail at boot, not per-request

- GIVEN `LIVEKIT_API_KEY` is unset
- WHEN the Next.js server boots
- THEN the boot MUST fail with an `Error` whose message contains `"LiveKit env vars missing"`
- AND no per-request `INTERNAL_SERVER_ERROR` is logged at the first `getRoomToken` call (the failure is at module load)

#### Scenario: serverUrl is forwarded from the env

- GIVEN `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`
- WHEN a token is issued
- THEN the response `serverUrl` MUST be exactly `"ws://localhost:7880"`

### Requirement: Audit Log

The procedure MUST write an `audit_logs` entry on every successful token issuance (the `FORBIDDEN` and `NOT_FOUND` paths MUST NOT write an audit entry — the actor was rejected, not served). The entry MUST be built from a fixed shape with these fields:

- `usuarioId` = `ctx.session.user.id`
- `accion` = `"CITA_ROOM_TOKEN_ISSUED"`
- `entidadAfectada` = `"citas"`
- `entidadId` = `citaId`
- `detalles` = `{ roomName: "cita-${citaId}", role: actor.role }` — the JWT `token` MUST NOT be in `detalles`

The audit write MUST be wrapped in a `try/catch`. If the audit write fails, the procedure MUST log a warning and MUST NOT fail the procedure (the token has been issued and the user is waiting in the call page; failing the call because of an audit log error is a worse outcome than missing an audit row).

#### Scenario: Audit row written on success

- GIVEN a successful token issuance for citaId `X` by a DOCTOR
- WHEN the procedure resolves
- THEN an `audit_logs` row MUST be written
- AND `accion` MUST be `"CITA_ROOM_TOKEN_ISSUED"`
- AND `entidadAfectada` MUST be `"citas"`
- AND `entidadId` MUST be `X`
- AND `detalles` MUST be `{ roomName: "cita-X", role: "DOCTOR" }` (or `PACIENTE` for the patient case)

#### Scenario: Token is NOT in the audit log

- GIVEN any successful token issuance
- WHEN the audit log row is inspected
- THEN the `detalles` JSON MUST NOT contain a `token` field
- AND MUST NOT contain any field whose value matches the JWT string (substring match across the whole row)

#### Scenario: Audit write failure does not fail the procedure

- GIVEN the audit log write throws (e.g. DB connection drops between token issuance and audit insert)
- WHEN the procedure resolves
- THEN the response MUST still be the `{ token, serverUrl, roomName }` payload
- AND a warning MUST be logged server-side
- AND no `TRPCError` MUST be surfaced to the client

#### Scenario: Failed gates do not write an audit row

- GIVEN a `FORBIDDEN` or `NOT_FOUND` outcome (status gate, time window, authorization)
- WHEN the procedure resolves
- THEN NO `audit_logs` row with `accion === 'CITA_ROOM_TOKEN_ISSUED'` MUST be written

### Requirement: AuditAction Enum Extension

The `AuditAction` union (in `src/application/use-cases/audit/write-audit-log.use-case.ts` or the central `src/domain/enums/index.ts`) MUST be extended with the new value `"CITA_ROOM_TOKEN_ISSUED"`. The extension is additive and backward-compatible: existing call sites that destructure `AuditAction` and existing switch statements over the union MUST keep compiling.

#### Scenario: New value accepted by the union

- GIVEN the updated `AuditAction` type
- WHEN a value of `"CITA_ROOM_TOKEN_ISSUED"` is passed to a function typed `accion: AuditAction`
- THEN TypeScript MUST accept the value (no compile error)

#### Scenario: Existing values still in the union

- GIVEN the updated `AuditAction` type
- WHEN the union is read at compile time
- THEN the prior values (`"CITA_CREATED"`, `"CITA_STATUS_CHANGED"`, etc.) MUST still be present
- AND no prior value SHALL be removed

## Modality Toggle Additions (2026-06-19)

The following requirement is ADDED to the video-calls-api spec by the `2026-06-19-modality-toggle` change. The modality gate is added inside `getRoomTokenUseCase` AFTER the existing status and time-window gate, so the new test MUST cover BOTH the new rejection AND the existing happy path (per D13 in the proposal — "added a new check, broke the existing flow because the existing flow was relying on a side effect the new check overwrites" is a common bug class; the regression guard is non-negotiable). The procedure wire surface (input shape, output shape, error codes for status/time) is unchanged — the modality gate is an internal use-case change, surfaced to the caller only as a new `FORBIDDEN` message.

### Requirement: REQ-VA-MOD-1 — getRoomToken rejects PRESENCIAL with modality-specific message

Inside `getRoomTokenUseCase` (`src/application/use-cases/bookings/get-room-token.use-case.ts`), AFTER the existing status + time-window gate passes (so the cita is in `EN_CURSO` or `CONFIRMADA` within the ±15 minute window), the use case MUST evaluate a new modality gate. When `cita.modalidad === 'PRESENCIAL'`, the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'Esta cita es presencial, no permite videollamada' })`. The Spanish message MUST be the exact string (character-for-character, including the missing accent on "videollamada" — the spec does not write "vídeollamada"; the message matches the production copy).

The gate MUST NOT change the error code for the other rejection cases (status / time-window / authorization). Those MUST keep their existing messages and codes (per the prior REQ-VC-API-3). The new modality-specific message MUST be a SEPARATE `if` branch — NOT a generic "fall through" — so a PRESENCIAL cita outside the time window still gets the time-window message (not the modality message), and a PRESENCIAL cita in `EN_CURSO` gets the modality message (not a status message). The gate order is: (1) authorization / existence, (2) status / time window, (3) modality — modality is the last gate before token issuance.

The token MUST NOT be issued for a PRESENCIAL cita under any circumstance (no override, no opt-out, no "doctor override" path). The audit log MUST NOT receive a `CITA_ROOM_TOKEN_ISSUED` row for a rejected modality — the FORBIDDEN path is a no-audit path, same as the other FORBIDDEN paths in the use case.

The existing ONLINE happy path MUST still pass after the new gate is added: an ONLINE cita within the status / time window MUST receive a token, and the audit row MUST be written as before. The new gate is a `cita.modalidad === 'PRESENCIAL'` check — ONLINE citas fall through the check unchanged.

#### Scenario: PRESENCIAL cita rejected with modality-specific message

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 5 minutes in the future
- WHEN `getRoomToken({ citaId })` is called
- THEN the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'Esta cita es presencial, no permite videollamada' })`
- AND the error code MUST be `FORBIDDEN` (NOT `BAD_REQUEST`, NOT `NOT_FOUND`)
- AND no token MUST be issued
- AND no `audit_logs` row with `accion === 'CITA_ROOM_TOKEN_ISSUED'` MUST be written (the FORBIDDEN path is no-audit)

#### Scenario: ONLINE cita within the window still receives a token (regression guard)

- GIVEN a cita with `modalidad === 'ONLINE'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 5 minutes in the future
- WHEN `getRoomToken({ citaId })` is called
- THEN the modality gate MUST NOT throw
- AND the use case MUST return `{ token, serverUrl, roomName }` with the documented shape
- AND an `audit_logs` row with `accion: 'CITA_ROOM_TOKEN_ISSUED'` MUST be written
- AND the response shape MUST be byte-identical to the pre-change ONLINE happy path (regression guard per D13)

#### Scenario: EN_CURSO + PRESENCIAL cita is rejected with the modality message

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'EN_CURSO'`
- WHEN `getRoomToken({ citaId })` is called
- THEN the status gate MUST pass (EN_CURSO bypasses the time check)
- AND the modality gate MUST throw with the modality-specific message
- AND the use case MUST throw `TRPCError({ code: 'FORBIDDEN', message: 'Esta cita es presencial, no permite videollamada' })`

#### Scenario: PRESENCIAL cita outside the time window gets the time-window message, not the modality message

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 30 minutes in the future
- WHEN `getRoomToken({ citaId })` is called
- THEN the status / time-window gate MUST throw FIRST with the time-window message (`"La videollamada se habilita 15 minutos antes de la hora de la cita."`)
- AND the modality gate MUST NOT be evaluated (gate order: status/time, then modality)
- AND the error message MUST be the time-window message, NOT the modality-specific message

#### Scenario: PRESENCIAL cita in COMPLETADA state gets the existing completion message

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'COMPLETADA'`
- WHEN `getRoomToken({ citaId })` is called
- THEN the status gate MUST throw with `"Esta cita ya no permite unirse a una videollamada."`
- AND the modality gate MUST NOT be evaluated

## LiveKit Webhooks Additions (2026-06-19)

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
