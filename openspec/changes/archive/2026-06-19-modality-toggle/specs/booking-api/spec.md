# Booking API Specification

## Purpose

Define the tRPC booking router — the public and protected procedures for slot discovery, appointment CRUD, status transitions, and notes management.

## Requirements

### Requirement: getDoctorSlots

The system MUST expose a public `getDoctorSlots` query accepting `doctorId` (string) and `date` (Date). It MUST return 30-min interval slots computed from the doctor's weekly availability minus overlapping citas. Cancelled/NO_ASISTIO citas MUST NOT block slots.

#### Scenario: Returns available slots for a doctor

- GIVEN a doctor with Monday availability 09:00–12:00 and citas at 09:30, 10:30
- WHEN `getDoctorSlots` is called with that doctorId on Monday
- THEN slots [09:00, 10:00, 11:00, 11:30] are `available: true` AND [09:30, 10:30] are `available: false`

#### Scenario: No availability returns empty

- GIVEN a doctor with no availability
- WHEN `getDoctorSlots` is called
- THEN the response MUST be an empty array

### Requirement: getMyAppointments

The system MUST expose a protected `getMyAppointments` query with optional `status` filter. PACIENTE sees citas matching their `pacienteId`; DOCTOR sees citas matching their `doctorId`. Response MUST include related names.

#### Scenario: Patient filters by status

- GIVEN a PACIENTE with 2 PENDIENTE and 1 COMPLETADA cita
- WHEN `getMyAppointments({ status: "PENDIENTE" })` is called
- THEN exactly 2 citas MUST be returned

#### Scenario: No appointments returns empty

- GIVEN a patient with no citas
- WHEN `getMyAppointments` is called
- THEN an empty array MUST be returned

### Requirement: createAppointment

The system MUST expose a protected PACIENTE-only mutation accepting `doctorId`, `fechaHora`, `motivoConsulta` (non-empty). It MUST create a Cita with `estado: PENDIENTE` and `duracionMinutos: 30`. Race conditions SHALL use `SELECT FOR UPDATE` within a Drizzle transaction.

#### Scenario: Patient books an available slot

- GIVEN a PACIENTE and a doctor with an available slot
- WHEN `createAppointment` is called with valid inputs
- THEN a Cita is created with `estado: "PENDIENTE"`

#### Scenario: Concurrent booking — one succeeds

- GIVEN two PACIENTE users targeting the same slot
- WHEN both call `createAppointment` concurrently
- THEN exactly one succeeds; the other gets CONFLICT

#### Scenario: Past date rejected

- GIVEN a `fechaHora` in the past
- WHEN `createAppointment` is called
- THEN a BAD_REQUEST error MUST be thrown

### Requirement: cancelAppointment

The system MUST expose a protected `cancelAppointment` mutation accepting `citaId`. PACIENTE MAY cancel own citas only. DOCTOR MAY cancel any. Transition to `CANCELADA`. Already-cancelled/completed citas MUST throw BAD_REQUEST.

#### Scenario: Patient cancels own appointment

- GIVEN a PACIENTE with a PENDIENTE cita
- WHEN `cancelAppointment` is called
- THEN `estado` becomes `CANCELADA`

#### Scenario: Cannot cancel another's appointment

- GIVEN a PACIENTE with another patient's citaId
- WHEN `cancelAppointment` is called
- THEN FORBIDDEN error MUST be thrown

### Requirement: updateAppointmentStatus

The system MUST expose a DOCTOR-only mutation accepting `citaId`, `estado`. It MUST reuse `transitionStatus()` and reject invalid transitions.

#### Scenario: Doctor confirms pending appointment

- GIVEN a DOCTOR with a PENDIENTE cita
- WHEN `updateAppointmentStatus({ estado: "CONFIRMADA" })` is called
- THEN `estado` becomes `CONFIRMADA`

#### Scenario: Invalid transition rejected

- GIVEN a PENDIENTE cita
- WHEN `updateAppointmentStatus({ estado: "COMPLETADA" })` is called
- THEN a BAD_REQUEST error MUST be thrown

### Requirement: updateAppointmentNotes

The system MUST expose a DOCTOR-only mutation accepting `citaId`, `notas`. Notes SHALL be overwritten.

#### Scenario: Doctor updates notes

- GIVEN a DOCTOR with a cita
- WHEN `updateAppointmentNotes({ notas: "Paciente mejorando" })` is called
- THEN the cita `notas` MUST be updated

## Video Calls Additions (2026-06-16)

The following requirements are ADDED to the booking-api spec by the `2026-06-16-video-calls` change. The full source of truth for the new procedure is `video-calls-api/spec.md`; this delta section is a forward pointer that keeps the booking-api spec self-contained and makes the new surface visible to the next reviewer.

### Requirement: getRoomToken

The booking router MUST expose a new protected query procedure `getRoomToken` that lets a participant of a `Cita` (the doctor or the patient) obtain a LiveKit access token to join the in-platform video call. The procedure MUST be added to the existing `bookings` router (NOT a new `videoCallsRouter`).

The full contract — input shape, output shape, authorization, status gate, time-window gate, token grants, audit log, and `AuditAction` union extension — is documented in `video-calls-api/spec.md` under `REQ-VC-API-1` through `REQ-VC-API-6`. The booking-api spec delegates the detail to that spec to avoid duplication.

The procedure is the 7th procedure in the `bookings` router (after `getDoctorSlots`, `getMyAppointments`, `createAppointment`, `cancelAppointment`, `updateAppointmentStatus`, `updateAppointmentNotes`).

#### Scenario: Procedure is callable from a participant

- GIVEN a PACIENTE authenticated against a CONFIRMADA cita within the ±15 minute window
- WHEN `api.bookings.getRoomToken({ citaId })` is called
- THEN the procedure MUST return `{ token, serverUrl, roomName }` with the shape documented in `video-calls-api/spec.md` REQ-VC-API-1

#### Scenario: Procedure is rejected for non-participants

- GIVEN an authenticated user who is neither the doctor nor the patient of the cita
- WHEN `api.bookings.getRoomToken({ citaId })` is called
- THEN the procedure MUST reject with `NOT_FOUND` (per the non-leakage rule in `video-calls-api/spec.md` REQ-VC-API-2)

#### Scenario: Procedure is rejected outside the status/time gates

- GIVEN a PENDIENTE cita
- WHEN `api.bookings.getRoomToken({ citaId })` is called
- THEN the procedure MUST reject with `FORBIDDEN` and the Spanish message documented in `video-calls-api/spec.md` REQ-VC-API-3

#### Scenario: Audit log is written on success

- GIVEN a successful token issuance
- WHEN the procedure resolves
- THEN an `audit_logs` row MUST be written with `accion: 'CITA_ROOM_TOKEN_ISSUED'`
- AND the `detalles` JSON MUST contain `{ roomName, role }` and MUST NOT contain the JWT (per `video-calls-api/spec.md` REQ-VC-API-5)

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the booking-api spec by the `2026-06-19-modality-toggle` change. The `createAppointment` input is extended with `modalidad`, the server-side gate rejects ONLINE citas for doctors who have not opted in, `getMyAppointments` returns the modality per cita, and a new `updateAcceptsOnline` mutation lives on the `profiles` router (NOT on `bookings`) but is documented here as a forward pointer so the doctor-side flow is visible from the booking spec. The full contract for `updateAcceptsOnline` lives in `profiles-api/spec.md` REQ-PA-MOD-3 (mutated) and the doctor UI in `doctor-settings-ui/spec.md`.

### Requirement: REQ-BA-MOD-1 — createAppointment accepts modalidad

The `bookings.createAppointment` procedure MUST accept a new required input field `modalidad: z.enum(['PRESENCIAL', 'ONLINE'])` in addition to the existing `doctorId`, `fechaHora`, and `motivoConsulta`. The Zod schema MUST be extended in `src/infrastructure/api/schemas/booking.ts` (or wherever `createAppointmentSchema` lives); the procedure body in `src/infrastructure/api/routers/bookings.ts` MUST pass the new value to `createAppointmentUseCase` unchanged (no transformation, no defaulting — the use case is the authority on modality).

The Zod validation MUST reject any `modalidad` value outside the two-value union with `BAD_REQUEST` (Zod's default `invalid_type_error`); the rejection MUST happen BEFORE the use case is invoked (a bad modality MUST NOT cost a DB round-trip). The persisted `Cita.modalidad` field MUST equal the input value verbatim (no coercion, no uppercasing, no whitespace trim — the union is already uppercase).

#### Scenario: createAppointment accepts PRESENCIAL

- GIVEN a PACIENTE and a doctor with an available slot
- WHEN `createAppointment({ doctorId, fechaHora, motivoConsulta: "...", modalidad: "PRESENCIAL" })` is called
- THEN a Cita is created with `modalidad: "PRESENCIAL"`
- AND `estado: "PENDIENTE"` AND `duracionMinutos: 30` (unchanged from the pre-change behavior)

#### Scenario: createAppointment accepts ONLINE for a doctor who opted in

- GIVEN a PACIENTE and a doctor with `aceptaOnline === true` and an available slot
- WHEN `createAppointment({ ..., modalidad: "ONLINE" })` is called
- THEN a Cita is created with `modalidad: "ONLINE"`
- AND no `FORBIDDEN` or `BAD_REQUEST` is thrown for modality

#### Scenario: createAppointment rejects an invalid modalidad

- GIVEN a valid PACIENTE and a valid slot
- WHEN `createAppointment({ ..., modalidad: "HIDRIDA" })` is called
- THEN the procedure MUST reject with `BAD_REQUEST` (Zod validation)
- AND the use case MUST NOT be invoked
- AND no Cita MUST be created

### Requirement: REQ-BA-MOD-2 — ONLINE rejected when doctor.aceptaOnline is false

Inside `createAppointmentUseCase` (`src/application/use-cases/bookings/create-appointment.use-case.ts`), after the existing `doctorId` / `fechaHora` / `motivoConsulta` / availability / conflicting-cita checks, the use case MUST evaluate a new gate. When the input `modalidad === 'ONLINE'`, the use case MUST load the doctor's `acepta_online` column (the `doctores` table) inside the same Drizzle transaction as the cita insert, and MUST throw `TRPCError({ code: 'BAD_REQUEST', message: 'El doctor no ofrece consultas online' })` if the doctor's `aceptaOnline === false` (or if the doctor row is missing — the missing-doctor case MUST collapse into the same `BAD_REQUEST` for modality-rejection consistency; the missing-doctor case is also caught by the pre-existing doctor-existence check earlier in the use case, but the modality check MUST use the same message to avoid a side-channel that leaks doctor existence).

The check MUST run inside the same transaction as the cita insert so a doctor who toggles `aceptaOnline` to `false` between the patient's "Confirmar" click and the mutation is correctly caught (the TOCTOU window is closed by the existing transaction — see AD-13 in the proposal). The check MUST NOT run for `modalidad === 'PRESENCIAL'` (a doctor who has not opted in is still allowed to receive presencial citas — modality is a per-cita property, not a doctor-level ban).

#### Scenario: ONLINE cita rejected when doctor has not opted in

- GIVEN a PACIENTE
- AND a doctor with `aceptaOnline === false`
- AND an available slot for that doctor
- WHEN `createAppointment({ ..., modalidad: "ONLINE" })` is called
- THEN the use case MUST throw `TRPCError({ code: 'BAD_REQUEST', message: 'El doctor no ofrece consultas online' })`
- AND NO Cita MUST be created (the transaction rolls back)
- AND the response MUST be the error (the Zod-validated input passes, the gate fails)

#### Scenario: PRESENCIAL cita accepted regardless of doctor aceptaOnline

- GIVEN a doctor with `aceptaOnline === false`
- WHEN `createAppointment({ ..., modalidad: "PRESENCIAL" })` is called
- THEN the use case MUST NOT evaluate the ONLINE gate (PRESENCIAL is unconditionally allowed)
- AND a Cita MUST be created with `modalidad: "PRESENCIAL"`

#### Scenario: ONLINE cita accepted when doctor has opted in

- GIVEN a doctor with `aceptaOnline === true`
- WHEN `createAppointment({ ..., modalidad: "ONLINE" })` is called
- THEN the use case MUST NOT throw the modality gate
- AND a Cita MUST be created with `modalidad: "ONLINE"`

#### Scenario: TOCTOU window is closed by the transaction

- GIVEN a doctor with `aceptaOnline === true` at the start of the transaction
- AND the doctor toggles `aceptaOnline` to `false` BEFORE the modality check runs
- WHEN `createAppointment({ ..., modalidad: "ONLINE" })` is called
- THEN the use case MUST re-read `acepta_online` inside the transaction (no cached/stale value)
- AND MUST throw the modality gate (the in-transaction read sees the new `false` value)
- AND no Cita MUST be created

### Requirement: REQ-BA-MOD-3 — getMyAppointments returns modalidad

The `getMyAppointments` response MUST include a `modalidad: ConsultaModalidad` field on every cita in the returned array. The field MUST be sourced from the `citas.modalidad` DB column (the column added in `db-schema/spec.md` REQ-DB-MOD-1). The response shape MUST remain backwards-compatible: existing fields (id, doctorId, pacienteId, fechaHora, estado, motivo, duracionMinutos, doctorName / pacienteName) MUST be unchanged; `modalidad` is purely additive. The field MUST be present even when the cita's `modalidad` is `PRESENCIAL` (no omission of the default value, no `undefined`).

#### Scenario: Response includes modalidad for every cita

- GIVEN a PACIENTE with 1 PRESENCIAL cita and 1 ONLINE cita
- WHEN `getMyAppointments()` is called
- THEN the response MUST be an array of 2 items
- AND the first cita's `modalidad` MUST be `"PRESENCIAL"`
- AND the second cita's `modalidad` MUST be `"ONLINE"`
- AND every other field on every cita MUST be unchanged from the pre-change response shape

#### Scenario: modalidad is present for pre-existing rows

- GIVEN a cita created before the modality change (the row was backfilled to `PRESENCIAL` by the migration)
- WHEN `getMyAppointments()` returns that cita
- THEN the response MUST include `modalidad: "PRESENCIAL"` (NOT `undefined`, NOT omitted)

### Requirement: REQ-BA-MOD-4 — updateAcceptsOnline procedure

A new protected tRPC mutation `updateAcceptsOnline` MUST be added to the existing `profiles` router (`src/infrastructure/api/routers/profiles.ts`). It is documented in this spec (not `profiles-api/spec.md`) because it is the doctor-side write that gates the booking flow — `bookings.createAppointment` reads `doctor.aceptaOnline` (REQ-BA-MOD-2) on every cita creation, so the procedure that mutates that field is part of the booking contract. The mutation is NOT folded into `updateMyProfile` (see D12 / AD-5 in the proposal — cleaner audit log, simpler schema, no pollution of `updateMyProfile`'s wire surface).

The procedure MUST be declared as:

```ts
updateAcceptsOnline: protectedProcedure
  .input(z.object({ aceptaOnline: z.boolean() }))
  .mutation(...)
```

The procedure MUST be restricted to users whose `ctx.session.user.role === 'DOCTOR'` (any other role — `PACIENTE`, `ADMIN`, `STAFF`, etc. — MUST be rejected with `FORBIDDEN`; `UNAUTHORIZED` is for the unauthenticated case and is enforced by `protectedProcedure` itself). The procedure MUST delegate all write + audit logic to a new use case `updateAcceptsOnlineUseCase(db, { doctorId, aceptaOnline, actorId, ipAddress })` — the procedure body is a thin wire adapter that resolves the actor's `doctorId` from the session and forwards the call.

The input MUST be exactly `{ aceptaOnline: z.boolean() }` — no other fields. The procedure MUST NOT accept an `aceptaOnline` value derived from the URL or query string (the only input channel is the mutation body). The procedure MUST return the updated doctor's `aceptaOnline` value (just the boolean) so the client can update its local state without a follow-up `getMyProfile` round-trip.

The use case MUST write a single `audit_logs` row inside the same transaction as the `doctores.acepta_online` UPDATE so a partial write cannot leave the toggle flipped without an audit row. The row MUST be built with these exact fields:

- `usuarioId` = `ctx.session.user.id`
- `accion` = `"DOCTOR_ACEPTA_ONLINE_CHANGED"`
- `entidadAfectada` = `"doctores"`
- `entidadId` = the doctor row's `id` (NOT the user id)
- `detalles` = `{ aceptaOnline: <newValue> }` — a single boolean key

The `AuditAction` union MUST be extended with `"DOCTOR_ACEPTA_ONLINE_CHANGED"`. The extension is additive and backward-compatible: existing call sites that destructure `AuditAction` and existing switch statements over the union MUST keep compiling. Prior values (`"CITA_CREATED"`, `"CITA_STATUS_CHANGED"`, `"CITA_ROOM_TOKEN_ISSUED"`, etc.) MUST still be present in the union.

On audit failure, the transaction MUST roll back, the procedure MUST reject with `INTERNAL_SERVER_ERROR`, and the client's optimistic update MUST revert (the UI is responsible for the revert — see `doctor-settings-ui/spec.md` REQ-DS-MOD-2).

#### Scenario: Doctor toggles online ON

- GIVEN an authenticated DOCTOR
- WHEN `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: true })` is called
- THEN the `doctores.acepta_online` column MUST be set to `true`
- AND an `audit_logs` row MUST be written with `accion: 'DOCTOR_ACEPTA_ONLINE_CHANGED'`, `entidadAfectada: 'doctores'`, `entidadId: <doctorId>`, `detalles: { aceptaOnline: true }`
- AND the response MUST be `{ aceptaOnline: true }`

#### Scenario: Doctor toggles online OFF

- GIVEN an authenticated DOCTOR with `aceptaOnline === true`
- WHEN `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: false })` is called
- THEN the `doctores.acepta_online` column MUST be set to `false`
- AND an `audit_logs` row MUST be written with `detalles: { aceptaOnline: false }`
- AND the response MUST be `{ aceptaOnline: false }`

#### Scenario: Non-doctor rejected with FORBIDDEN

- GIVEN an authenticated user with `role === 'PACIENTE'` (or `ADMIN`, `STAFF`, etc.)
- WHEN `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: true })` is called
- THEN the procedure MUST reject with `FORBIDDEN`
- AND no `doctores` row MUST be modified
- AND no `audit_logs` row MUST be written

#### Scenario: Unauthenticated request rejected

- GIVEN no active session
- WHEN `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: true })` is called
- THEN the procedure MUST reject with `UNAUTHORIZED` (enforced by `protectedProcedure`)
- AND the use case MUST NOT be invoked

#### Scenario: Invalid input rejected by Zod

- GIVEN an authenticated DOCTOR
- WHEN `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: "yes" })` is called (string instead of boolean)
- THEN the procedure MUST reject with `BAD_REQUEST` (Zod validation)
- AND the use case MUST NOT be invoked

#### Scenario: Audit failure rolls back the toggle

- GIVEN the `audit_logs` insert throws (e.g. DB constraint violation, connection drop)
- WHEN `updateAcceptsOnline` is called
- THEN the `doctores.acepta_online` UPDATE MUST be rolled back
- AND the mutation MUST reject with `INTERNAL_SERVER_ERROR`
- AND the doctor's `aceptaOnline` value MUST be the pre-mutation value (verified by a follow-up `getMyProfile` call)

#### Scenario: AuditAction union accepts the new value

- GIVEN the updated `AuditAction` union
- WHEN a value of `"DOCTOR_ACEPTA_ONLINE_CHANGED"` is passed to a function typed `accion: AuditAction`
- THEN TypeScript MUST accept the value (no compile error)
- AND prior values (`"CITA_CREATED"`, `"CITA_STATUS_CHANGED"`, `"CITA_ROOM_TOKEN_ISSUED"`, etc.) MUST still be present in the union
