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
