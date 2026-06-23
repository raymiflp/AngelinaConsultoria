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
