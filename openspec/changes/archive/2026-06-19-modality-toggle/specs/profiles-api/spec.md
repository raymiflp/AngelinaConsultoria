# Profiles API Specification

## Purpose

Defines the tRPC profiles router for authenticated profile retrieval and update (doctor/patient), plus public doctor lookup. All secrets (password hashes) MUST NOT be exposed in responses.

## Requirements

### Requirement: getMyProfile

The system MUST return the authenticated user's account data (Usuario id, email, nombreCompleto, telefono, rol) plus role-specific extension — Doctor fields for DOCTOR users, Paciente fields for PACIENTE users.

#### Scenario: Doctor retrieves own profile

- GIVEN an authenticated user with rol=DOCTOR and an existing Doctor row
- WHEN they call `api.profiles.getMyProfile.useQuery()`
- THEN the response MUST include Usuario fields AND Doctor fields (especialidad, biografia, precioConsulta, calificacionMedia)

#### Scenario: Patient retrieves own profile

- GIVEN an authenticated user with rol=PACIENTE and an existing Paciente row
- WHEN they call `api.profiles.getMyProfile.useQuery()`
- THEN the response MUST include Usuario fields AND Paciente fields (fechaNacimiento, direccion, alergias, grupoSanguineo, notasMedicas)

#### Scenario: Unauthenticated request

- GIVEN no active session
- WHEN an unauthenticated request hits getMyProfile
- THEN the system MUST reject with TRPCError code UNAUTHORIZED

#### Scenario: Profile record is missing

- GIVEN an authenticated user with no Doctor or Paciente row
- WHEN they call getMyProfile
- THEN the response MUST return Usuario data with null for the role extension

### Requirement: updateMyProfile

The system SHALL validate input via role-specific Zod schemas, persist changes to the database, and return the updated profile. Doctors SHALL only update Doctor fields; patients SHALL only update Paciente fields.

#### Scenario: Doctor updates professional info

- GIVEN an authenticated DOCTOR
- WHEN they call `api.profiles.updateMyProfile.mutate({ especialidad: "Cardiología", biografia: "20 years experience" })`
- THEN the Doctor row SHALL be updated AND the response SHALL return the full updated profile

#### Scenario: Patient updates medical notes

- GIVEN an authenticated PACIENTE
- WHEN they call `api.profiles.updateMyProfile.mutate({ notasMedicas: "Alérgico a penicilina" })`
- THEN the Paciente row SHALL be updated AND the response SHALL return the full updated profile

#### Scenario: Cross-role field rejected

- GIVEN an authenticated DOCTOR
- WHEN they call updateMyProfile with patient-only fields (notasMedicas, fechaNacimiento)
- THEN the system MUST reject with TRPCError code BAD_REQUEST

#### Scenario: Invalid input data

- GIVEN any authenticated user
- WHEN they call updateMyProfile with invalid data (e.g. `{ precioConsulta: -10 }`)
- THEN the system MUST reject with TRPCError code BAD_REQUEST including Zod validation details

### Requirement: getDoctorProfile

The system MUST return public doctor info (nombreCompleto, especialidad, biografia, precioConsulta, calificacionMedia) without requiring authentication.

#### Scenario: Existing doctor found

- GIVEN a valid doctorId for an existing Doctor record
- WHEN any user calls `api.profiles.getDoctorProfile.query({ doctorId })`
- THEN the response MUST include nombreCompleto, especialidad, biografia, precioConsulta, and calificacionMedia

#### Scenario: Doctor not found

- GIVEN a doctorId that does not match any Doctor record
- WHEN any user calls `api.profiles.getDoctorProfile.query({ doctorId })`
- THEN the system MUST reject with TRPCError code NOT_FOUND

### Requirement: getDoctorFullProfile

The system MUST expose a public tRPC procedure `getDoctorFullProfile` under the `profilesRouter` that returns ALL profile data (profile + hero fields + experience + services + conditions) in a single query using Drizzle relational queries. The procedure MUST be public (no authentication required).

#### Scenario: Complete profile returned

- GIVEN a doctor with 2 experience entries, 3 services, and 4 conditions
- WHEN `api.profiles.getDoctorFullProfile.query({ doctorId })` is called
- THEN the response MUST include the profile fields (id, nombre, especialidad, etc.)
- AND `experience` MUST be an array of 2 items sorted by `orden` ASC, then `fechaInicio` DESC
- AND `services` MUST be an array of 3 items sorted by `orden` ASC (only `activo=true` entries)
- AND `conditions` MUST be an array of 4 items

#### Scenario: Doctor not found

- GIVEN a doctorId that does not match any Doctor record
- WHEN `getDoctorFullProfile` is called
- THEN the system MUST reject with TRPCError code `NOT_FOUND`

#### Scenario: Partial data — no sections configured

- GIVEN a doctor with no experience, services, or conditions records
- WHEN `getDoctorFullProfile` is called
- THEN the response MUST include profile fields
- AND `experience` MUST be an empty array `[]`
- AND `services` MUST be an empty array `[]`
- AND `conditions` MUST be an empty array `[]`

#### Scenario: Public access allowed

- GIVEN no active session
- WHEN an unauthenticated request calls `getDoctorFullProfile`
- THEN the procedure MUST NOT reject with UNAUTHORIZED
- AND the response MUST contain the full profile data

### Requirement: getDoctorServices

The system MUST expose `getDoctorServices` as a standalone public query under the `profilesRouter` returning only the doctor's active services. This endpoint exists for the future booking flow to fetch service data independently.

#### Scenario: Returns active services only

- GIVEN a doctor with 4 services (3 active, 1 inactive)
- WHEN `api.profiles.getDoctorServices.query({ doctorId })` is called
- THEN the response MUST contain exactly 3 services
- AND inactive services (`activo=false`) MUST NOT be included

#### Scenario: Empty services

- GIVEN a doctor with no services configured
- WHEN `getDoctorServices` is called
- THEN the response MUST be an empty array `[]`

#### Scenario: Doctor not found

- GIVEN a doctorId that does not match any Doctor record
- WHEN `getDoctorServices` is called
- THEN the system MUST reject with TRPCError code `NOT_FOUND`

### Requirement: Admin Doctor Management (Added)

The admin CRUD for doctors (`adminRouter` procedures) is SEPARATE from profile management. Admin CRUD bypasses the `updateMyProfile` role-based field restrictions — admins MAY update any Doctor and Usuario field (except email and role).

#### Scenario: Admin can update any doctor's fields

- GIVEN an authenticated admin session
- WHEN `admin.updateDoctor` is called with fields including `especialidad`, `biografia`, `precioConsulta`, `nombre`, `telefono`
- THEN ALL fields MUST be updated regardless of role-based restrictions that apply to `updateMyProfile`

### Requirement: getPatientProfile

The system MUST return patient profile details for the authenticated patient only. Non-patient callers SHALL be rejected.

#### Scenario: Patient retrieves own data

- GIVEN an authenticated PACIENTE
- WHEN they call `api.profiles.getPatientProfile.query()`
- THEN the response MUST include fechaNacimiento, direccion, alergias, grupoSanguineo, and notasMedicas

#### Scenario: Non-patient rejected

- GIVEN an authenticated DOCTOR or unauthenticated user
- WHEN they call getPatientProfile
- THEN the system MUST reject with TRPCError code FORBIDDEN or UNAUTHORIZED respectively

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the profiles-api spec by the `2026-06-19-modality-toggle` change. Two existing public procedures (`getDoctorProfile`, `getDoctorFullProfile`) gain a new field in the response (`aceptaOnline`), and the `listDoctorProfiles` query gains an optional `aceptaOnline` filter. The new `updateAcceptsOnline` mutation is documented in `booking-api/spec.md` REQ-BA-MOD-4 (the doctor-side write is a business-rule action that gates the booking flow, so its full contract lives alongside the other booking-related procedures).

### Requirement: REQ-PA-MOD-1 — getDoctorProfile returns aceptaOnline

The public `profiles.getDoctorProfile` query MUST include the new `aceptaOnline: boolean` field in the response (sourced from the `doctores.acepta_online` column added in `db-schema/spec.md` REQ-DB-MOD-2). The field MUST be present on every successful response — even for doctors who have not opted in (the value MUST be `false`, NOT omitted). The field MUST be at the top level of the doctor object (NOT nested under a new sub-object), in the same flat shape as the other public doctor fields.

The new field MUST NOT change the public-vs-private boundary: `getDoctorProfile` is public, and `aceptaOnline` is a public property of the doctor (patients need to see it before booking — see `profiles-ui/spec.md` REQ-PU-MOD-1). The field MUST NOT include any other modality-related data (no `modalidad` enum, no list of upcoming cita modalities — the public profile is a doctor-level view, not a cita-level view).

#### Scenario: Existing doctor includes aceptaOnline in response

- GIVEN a doctor with `aceptaOnline === true`
- WHEN `api.profiles.getDoctorProfile.query({ doctorId })` is called
- THEN the response MUST include `aceptaOnline: true` at the top level
- AND all pre-existing fields (nombreCompleto, especialidad, biografia, precioConsulta, calificacionMedia) MUST remain unchanged

#### Scenario: Doctor who has not opted in still returns aceptaOnline

- GIVEN a doctor with `aceptaOnline === false` (the default)
- WHEN `api.profiles.getDoctorProfile.query({ doctorId })` is called
- THEN the response MUST include `aceptaOnline: false` (NOT omitted, NOT `undefined`)

#### Scenario: Public access is preserved

- GIVEN no active session
- WHEN an unauthenticated request calls `getDoctorProfile`
- THEN the procedure MUST NOT reject with `UNAUTHORIZED`
- AND the response MUST include `aceptaOnline` along with the other public fields

### Requirement: REQ-PA-MOD-2 — getDoctorFullProfile returns aceptaOnline

The public `profiles.getDoctorFullProfile` query MUST include the new `aceptaOnline: boolean` field in the response, in the same top-level position as the other profile-level fields (next to `nombre`, `especialidad`, etc.). The field MUST be present on every successful response and MUST be sourced from the same `doctores.acepta_online` column. The field MUST be `false` for doctors who have not opted in (no omission).

The new field MUST NOT change the response shape for `experience`, `services`, or `conditions` (those sub-arrays are unchanged). The new field MUST be at the top level, NOT inside a new `modality` sub-object — keeping the field flat is consistent with the existing public profile shape.

#### Scenario: Full profile response includes aceptaOnline

- GIVEN a doctor with 2 experience entries, 3 services, 4 conditions, and `aceptaOnline === true`
- WHEN `api.profiles.getDoctorFullProfile.query({ doctorId })` is called
- THEN the response MUST include `aceptaOnline: true` at the top level
- AND `experience`, `services`, and `conditions` MUST be unchanged in shape and content

#### Scenario: Public access is preserved (full profile)

- GIVEN no active session
- WHEN an unauthenticated request calls `getDoctorFullProfile`
- THEN the procedure MUST NOT reject with `UNAUTHORIZED`
- AND the response MUST include `aceptaOnline` along with the other public fields and sub-arrays

### Requirement: REQ-PA-MOD-3 — listDoctorProfiles accepts aceptaOnline filter

The public `profiles.listDoctorProfiles` query MUST accept a new OPTIONAL input field `aceptaOnline?: z.boolean()`. When the field is `undefined` (or omitted), the procedure MUST return all doctors (current behavior, unchanged). When the field is `true`, the procedure MUST filter the result set to doctors with `doctores.acepta_online = true`. When the field is `false`, the procedure MUST filter to doctors with `doctores.acepta_online = false`.

The filter MUST be applied as a `WHERE` clause in the underlying SQL (not as an in-memory post-filter) so the response size matches the filter (no over-fetching). The filter MUST be combinable with any pre-existing filters (search by name, filter by especialidad) — the new `aceptaOnline` filter is additive, NOT exclusive. The response shape MUST be unchanged: the procedure still returns the same array of doctor summaries, just with the filtered subset.

This requirement is the server-side half of the `/doctores` listing filter (see `profiles-ui/spec.md` REQ-PU-MOD-2 for the UI half — the pill that toggles `?aceptaOnline=true` in the URL and forwards the flag to this procedure). The two halves are independent: the procedure works without the UI (callers can pass `aceptaOnline` directly), the UI works without the new filter (no param = no filter).

#### Scenario: Filter true returns only online-capable doctors

- GIVEN 3 doctors: A (`aceptaOnline === true`), B (`false`), C (`true`)
- WHEN `api.profiles.listDoctorProfiles.query({ aceptaOnline: true })` is called
- THEN the response MUST be an array containing doctors A and C only
- AND doctor B MUST NOT be in the response

#### Scenario: Filter false returns only offline doctors

- GIVEN 3 doctors: A (`true`), B (`false`), C (`true`)
- WHEN `api.profiles.listDoctorProfiles.query({ aceptaOnline: false })` is called
- THEN the response MUST contain only doctor B

#### Scenario: Undefined filter returns all doctors

- GIVEN any set of doctors
- WHEN `api.profiles.listDoctorProfiles.query({})` is called (or with the field omitted)
- THEN the response MUST include all doctors (the pre-change behavior, unchanged)
- AND the response shape MUST be identical to a call without the field

#### Scenario: Filter is applied in SQL

- GIVEN a query with `aceptaOnline: true`
- WHEN the procedure is profiled or its logs are inspected
- THEN the underlying SQL MUST include a `WHERE doctores.acepta_online = true` clause
- AND the response size MUST match the filtered count (no over-fetching)
