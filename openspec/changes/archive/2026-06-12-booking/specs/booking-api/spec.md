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
- THEN BAD_REQUEST error MUST be thrown

### Requirement: updateAppointmentNotes

The system MUST expose a DOCTOR-only mutation accepting `citaId`, `notas`. Notes SHALL be overwritten.

#### Scenario: Doctor updates notes

- GIVEN a DOCTOR with a cita
- WHEN `updateAppointmentNotes({ notas: "Paciente mejorando" })` is called
- THEN the cita `notas` MUST be updated
