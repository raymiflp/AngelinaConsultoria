# Domain Entities Specification

## Purpose

Define the pure domain enums and entities for the medico-consulta platform. Entities MUST NOT import any infrastructure concerns (database, framework, HTTP). Each entity MUST use shared value objects where applicable and enforce its own business invariants on construction.

## Requirements

### Requirement: UserRole Enum

The system MUST define a `UserRole` enum with these values: `PACIENTE`, `DOCTOR`, `ADMIN`, `DPO`, `SUPERADMIN`, `TUTOR`, `STAFF`, `CONTENT`, `FINANZAS`, `ASEGURADORA`.

#### Scenario: All roles enumerated

- GIVEN the `UserRole` enum
- WHEN accessing all values
- THEN exactly 10 values MUST exist including `PACIENTE`, `DOCTOR`, `ADMIN`, `DPO`, `SUPERADMIN`, `TUTOR`, `STAFF`, `CONTENT`, `FINANZAS`, `ASEGURADORA`

**Note:** The `ADMIN` value is now actively enforced by `adminProcedure` middleware (see auth-core spec). Previously defined but not operationally enforced, the ADMIN role now gates access to admin-only procedures via `session.user.role === "ADMIN"`.

##### Scenario: ADMIN role used in authorization

- GIVEN a user with `UserRole.ADMIN`
- WHEN they call an admin-protected procedure
- THEN the authorization middleware MUST pass the user through to the handler

##### Scenario: Non-ADMIN rejected by admin middleware

- GIVEN a user with `UserRole.DOCTOR`
- WHEN they call an admin-protected procedure
- THEN the authorization middleware MUST reject with `FORBIDDEN`

### Requirement: ConsultationStatus Enum

The system MUST define a `ConsultationStatus` enum with these values: `PENDIENTE`, `CONFIRMADA`, `EN_CURSO`, `COMPLETADA`, `CANCELADA`, `NO_ASISTIO`.

#### Scenario: Valid status transitions

- GIVEN a `Cita` with status `PENDIENTE`
- WHEN the status is updated to `CONFIRMADA`
- THEN the transition MUST succeed

### Requirement: Usuario Entity Invariants

The `Usuario` entity MUST contain: `id` (string UUID), `email` (Email VO), `passwordHash` (string), `role` (UserRole), `nombre` (FullName VO), `telefono` (Phone VO), `activo` (boolean), `createdAt` (Date), `updatedAt` (Date). The `passwordHash` MUST be a non-empty string. The `activo` flag MUST default to `true`.

#### Scenario: Valid usuario construction

- GIVEN valid Email, FullName, Phone, UserRole, and passwordHash
- WHEN a `Usuario` entity is constructed
- THEN all fields are assigned AND `activo` is `true` AND `id` is a non-empty UUID

#### Scenario: Empty passwordHash rejected

- GIVEN a passwordHash of `""`
- WHEN a `Usuario` entity is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: Doctor Entity Invariants

The `Doctor` entity MUST contain: `id`, `usuarioId`, `numeroColegiado` (unique string), `especialidad` (string), `biografia` (optional string), `precioConsulta` (optional number), `verificado` (boolean, default false), `calificacionMedia` (optional number, 0–5 range). The entity MAY also include these optional profile fields: `fotoUrl` (string), `ubicacionConsulta` (string), `añosExperiencia` (number), `idiomas` (string array), `telefonoConsulta` (string).

#### Scenario: Valid doctor construction

- GIVEN a usuarioId and a valid `numeroColegiado`
- WHEN a `Doctor` entity is constructed
- THEN `verificado` is `false` AND `calificacionMedia` is `undefined`

#### Scenario: CalificacionMedia out of range rejected

- GIVEN a `calificacionMedia` of `5.5`
- WHEN a `Doctor` entity is constructed
- THEN a `ValidationError` MUST be thrown

#### Scenario: Doctor constructed with new optional profile fields

- GIVEN a `create()` call with `fotoUrl`, `ubicacionConsulta`, `añosExperiencia: 15`, `idiomas: ["Español", "Inglés"]`, `telefonoConsulta`
- WHEN the entity is constructed
- THEN `fotoUrl` MUST be the trimmed URL string
- AND `ubicacionConsulta` MUST be the trimmed address string
- AND `añosExperiencia` MUST be `15`
- AND `idiomas` MUST be `["Español", "Inglés"]`
- AND `telefonoConsulta` MUST be the trimmed phone string

#### Scenario: Doctor constructed without new profile fields

- GIVEN a `create()` call without any new profile fields
- WHEN the entity is constructed
- THEN all 5 profile fields MUST be `undefined`

#### Scenario: añosExperiencia out of range

- GIVEN a `create()` call with `añosExperiencia: -1`
- WHEN the entity is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: DoctorExperience Entity Invariants

The system MUST define a `DoctorExperience` entity with readonly properties: `id`, `doctorId`, `tipo` ("education" | "work"), `titulo`, `institucion`, `fechaInicio`, `fechaFin` (optional), `descripcion` (optional), `orden`. The `create()` factory MUST validate non-empty required fields and valid `tipo` values.

#### Scenario: Valid education entry

- GIVEN valid props for an education entry (`tipo="education"`)
- WHEN `DoctorExperience.create()` is called
- THEN the entity MUST have all fields assigned AND `tipo` MUST be `"education"`

#### Scenario: Valid work entry

- GIVEN valid props for a work entry (`tipo="work"`)
- WHEN `DoctorExperience.create()` is called
- THEN the entity MUST have all fields assigned AND `tipo` MUST be `"work"`

#### Scenario: Invalid tipo rejected

- GIVEN a `tipo` value of `"certification"`
- WHEN `DoctorExperience.create()` is called
- THEN a `ValidationError` MUST be thrown

#### Scenario: Empty titulo rejected

- GIVEN a `create()` call with `titulo: ""`
- WHEN `DoctorExperience.create()` is called
- THEN a `ValidationError` MUST be thrown

### Requirement: DoctorService Entity Invariants

The system MUST define a `DoctorService` entity with readonly properties: `id`, `doctorId`, `nombre`, `descripcion` (optional), `precio`, `duracionMinutos` (optional), `activo`, `orden`. The `create()` factory MUST validate `nombre` is non-empty and `precio` is positive.

#### Scenario: Valid service construction

- GIVEN a `nombre`, positive `precio`, and optional `duracionMinutos`
- WHEN `DoctorService.create()` is called
- THEN ALL fields are assigned AND `activo` is `true`

#### Scenario: Negative precio rejected

- GIVEN a `precio` of `-10`
- WHEN `DoctorService.create()` is called
- THEN a `ValidationError` MUST be thrown

#### Scenario: Empty nombre rejected

- GIVEN `nombre: ""`
- WHEN `DoctorService.create()` is called
- THEN a `ValidationError` MUST be thrown

### Requirement: DoctorCondition Entity Invariants

The system MUST define a `DoctorCondition` entity with readonly properties: `id`, `doctorId`, `nombre`. The `create()` factory MUST validate `nombre` is non-empty.

#### Scenario: Valid condition construction

- GIVEN a non-empty `nombre`
- WHEN `DoctorCondition.create()` is called
- THEN the entity MUST have all fields assigned

#### Scenario: Empty nombre rejected

- GIVEN `nombre: ""`
- WHEN `DoctorCondition.create()` is called
- THEN a `ValidationError` MUST be thrown

### Requirement: Paciente Entity Invariants

The `Paciente` entity MUST contain: `id`, `usuarioId`, `fechaNacimiento` (Date), `direccion` (Address VO), `alergias` (optional string array), `grupoSanguineo` (optional string), `notasMedicas` (optional string).

#### Scenario: Valid paciente construction

- GIVEN a usuarioId, birth date, and valid Address
- WHEN a `Paciente` entity is constructed
- THEN all required fields are assigned AND `alergias` defaults to empty array

### Requirement: Cita Entity Invariants

The `Cita` entity MUST contain: `id`, `doctorId`, `pacienteId`, `fechaHora` (Date), `estado` (ConsultationStatus, default `PENDIENTE`), `motivo` (string), `duracionMinutos` (number, default 30), `precio` (optional number). The `motivo` MUST be a non-empty string. The `fechaHora` MUST be in the future on creation.

#### Scenario: Valid cita construction

- GIVEN a valid doctorId, pacienteId, future fechaHora, and motivo
- WHEN a `Cita` entity is constructed
- THEN `estado` is `PENDIENTE` AND `duracionMinutos` is `30`

#### Scenario: Past fechaHora rejected

- GIVEN a `fechaHora` in the past
- WHEN a `Cita` entity is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: AuditLog Entity Invariants

The `AuditLog` entity MUST contain: `id`, `usuarioId`, `accion` (string), `entidadAfectada` (string), `entidadId` (string), `detalles` (optional JSON object), `direccionIP` (string), `createdAt` (Date, auto-generated). All string fields MUST be non-empty.

#### Scenario: Valid audit log entry

- GIVEN a usuarioId, action, entity type, entity ID, and IP address
- WHEN an `AuditLog` entity is constructed
- THEN `createdAt` is set to current UTC time

### Requirement: Consentimiento Entity Invariants

The `Consentimiento` entity MUST contain: `id`, `usuarioId`, `tipo` (string), `version` (string), `aceptado` (boolean), `fechaAceptacion` (optional Date), `fechaExpiracion` (optional Date). If `aceptado` is `true`, `fechaAceptacion` MUST be present. If `fechaExpiracion` is set, it MUST be after `fechaAceptacion`.

#### Scenario: Accepted consent requires date

- GIVEN `aceptado: true` and no `fechaAceptacion`
- WHEN a `Consentimiento` entity is constructed
- THEN a `ValidationError` MUST be thrown

#### Scenario: Expiration before acceptance rejected

- GIVEN `fechaExpiracion` before `fechaAceptacion`
- WHEN a `Consentimiento` entity is constructed
- THEN a `ValidationError` MUST be thrown

## Video Calls Additions (2026-06-16)

The following requirement is ADDED to the domain-entities spec by the `2026-06-16-video-calls` change. The getter is the single source of truth for the LiveKit room name in MVP; the `citas.livekit_room_name` DB column (see `db-schema/spec.md` REQ-DB-VC-1) is reserved for future flexibility and is NOT read by this getter.

### Requirement: Cita.livekitRoomName getter

The `Cita` entity MUST expose a `livekitRoomName` getter that returns the LiveKit room name for the cita. The getter MUST be a pure derivation from the cita's `id` (no DB read, no DB column lookup, no `this.livekitRoomName` field). The getter MUST return the string `"cita-${this.id}"` for any cita instance, where `this.id` is a valid UUID. The getter MUST be a `get` accessor (NOT a method), so the call site reads `cita.livekitRoomName` (property access), not `cita.livekitRoomName()`.

The getter MUST always return a non-null, non-empty string. The format is the exact concatenation: the four-character prefix `cita-` followed by the cita's id verbatim (no transformation, no lowercasing of the UUID's hex characters). Because the id is a UUID, the result matches the regex `/^cita-[0-9a-f-]{36}$/`.

The derivation is the source of truth for the room name in MVP. The DB column is reserved for a future where we may want to support ad-hoc room names (group sessions, breakout rooms) without breaking the API. Using a getter keeps the rule server-side and prevents client-side leaks of the naming convention (a client cannot iterate `cita-1` … `cita-N` to probe room names).

#### Scenario: Getter returns the documented format

- GIVEN a `Cita` with `id = "8d2a1f8e-2b1c-4f00-aaaa-000000000001"`
- WHEN `cita.livekitRoomName` is accessed
- THEN the result MUST be the string `"cita-8d2a1f8e-2b1c-4f00-aaaa-000000000001"`
- AND the result MUST match the regex `/^cita-[0-9a-f-]{36}$/`

#### Scenario: Getter is a property, not a method

- GIVEN the `Cita` entity
- WHEN the entity's API is inspected
- THEN `livekitRoomName` MUST be declared as a `get` accessor (TypeScript `get livekitRoomName(): string`)
- AND call sites MUST read `cita.livekitRoomName` (property access), NOT `cita.livekitRoomName()`

#### Scenario: Getter is pure and does not read the DB column

- GIVEN a `Cita` constructed without the `livekitRoomName` DB column populated (e.g. from a query that did not select the column, or a freshly constructed in-memory cita)
- WHEN `cita.livekitRoomName` is accessed
- THEN the result MUST still be `"cita-${this.id}"` (the getter ignores the column entirely)
- AND the result MUST NOT be `undefined`, `null`, or an empty string

#### Scenario: Getter does not mutate state

- GIVEN a `Cita` instance
- WHEN `cita.livekitRoomName` is accessed 100 times
- THEN the result MUST be identical on every access
- AND no internal field of the cita MUST change
- AND no I/O (DB, network, filesystem) MUST be triggered

#### Scenario: Constructor does not accept livekitRoomName

- GIVEN the `Cita.create()` factory
- WHEN called with valid cita props
- THEN the factory MUST NOT accept a `livekitRoomName` argument (the room name is derived, not stored)
- AND the factory signature MUST NOT change compared to the pre-change version (this is an additive change)

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the domain-entities spec by the `2026-06-19-modality-toggle` change. The new `ConsultaModalidad` enum and the two new fields (`Cita.modalidad`, `Doctor.aceptaOnline`) are additive — the existing constructor signatures gain a new optional parameter; the `create()` factory defaults preserve backwards compatibility with existing call sites that do not pass the new argument.

### Requirement: REQ-DE-MOD-1 — ConsultaModalidad Enum

The system MUST define a `ConsultaModalidad` enum in `src/domain/enums/index.ts` with exactly two values: `PRESENCIAL` and `ONLINE`. The enum MUST follow the existing `UserRole` / `ConsultationStatus` pattern: a `const` TypeScript union (or string-literal type) — NOT a `pg_enum`, NOT a runtime class with a method. The enum MUST be exported from the central enums barrel so it can be imported alongside `ConsultationStatus`. The values MUST be uppercase strings and MUST be exactly `"PRESENCIAL"` and `"ONLINE"` (no lowercase variants, no other casing, no trailing whitespace).

The enum is intentionally narrow (two values) and the codebase does not define a third value in MVP. If a future change adds a value (e.g. `"DOMICILIO"`), it lands in that change's spec.

#### Scenario: Enum has exactly the two documented values

- GIVEN the `ConsultaModalidad` enum in `src/domain/enums/index.ts`
- WHEN inspected
- THEN it MUST be importable as a TypeScript type
- AND the union MUST be exactly `"PRESENCIAL" | "ONLINE"`
- AND the runtime string values (if exposed) MUST be the same two strings

#### Scenario: Invalid value is a TypeScript compile error

- GIVEN a function typed `modalidad: ConsultaModalidad`
- WHEN a caller passes `modalidad: "INVALID"` (or any string outside the union)
- THEN TypeScript MUST reject the call (no compile)

#### Scenario: Enum is exported from the central enums barrel

- GIVEN the central enums barrel `src/domain/enums/index.ts`
- WHEN other modules import `ConsultaModalidad`
- THEN the import MUST succeed via the barrel path (e.g. `import { ConsultaModalidad } from '@/domain/enums'`)
- AND no relative path bypassing the barrel is required

### Requirement: REQ-DE-MOD-2 — Cita.modalidad Field

The `Cita` entity MUST be extended with a new readonly field `modalidad: ConsultaModalidad`. The field MUST be assigned in the constructor (NOT a default property, NOT a getter — a stored value, because it is set at creation and never changes for the cita's lifetime). The `Cita.create()` factory MUST accept an optional `modalidad` argument; when omitted, the factory MUST default the value to `PRESENCIAL` (preserving backwards compatibility with existing call sites that do not pass a modality). The default MUST be `PRESENCIAL` regardless of the doctor's `aceptaOnline` value at creation time — modality is a per-cita property, not derived from the doctor.

The factory MUST validate the new `modalidad` argument is one of the two `ConsultaModalidad` values; any other value MUST throw `ValidationError` (a runtime guard on top of the TypeScript type, so a future JSON deserialization path cannot smuggle a bad value). The factory MUST NOT change any other field, MUST NOT change the order of existing required arguments, and MUST NOT change the return shape — the new argument is purely additive.

#### Scenario: Cita defaults to PRESENCIAL when modality is omitted

- GIVEN a `create()` call with the original pre-change arguments (no `modalidad`)
- WHEN the factory is invoked
- THEN the resulting `Cita` MUST have `modalidad === 'PRESENCIAL'`
- AND the `estado`, `duracionMinutos`, `motivo`, and all other fields MUST be unchanged from the pre-change behavior

#### Scenario: Cita accepts ONLINE when modality is passed

- GIVEN a `create()` call with `modalidad: 'ONLINE'`
- WHEN the factory is invoked
- THEN the resulting `Cita` MUST have `modalidad === 'ONLINE'`

#### Scenario: Invalid modality value rejected

- GIVEN a `create()` call with `modalidad: 'HIDRIDA'` (or any string outside the union)
- WHEN the factory is invoked
- THEN a `ValidationError` MUST be thrown
- AND no `Cita` instance MUST be returned

#### Scenario: Pre-existing factory call sites compile unchanged

- GIVEN any call site that calls `Cita.create({ ... })` without a `modalidad` key
- WHEN the codebase is type-checked
- THEN the call MUST compile (the field is optional with a default of `PRESENCIAL`)
- AND the call site MUST NOT require a code change to keep compiling

### Requirement: REQ-DE-MOD-3 — Doctor.aceptaOnline Field

The `Doctor` entity MUST be extended with a new readonly field `aceptaOnline: boolean`. The field MUST be assigned in the constructor (a stored value, NOT a getter). The `Doctor.create()` factory MUST accept an optional `aceptaOnline` argument; when omitted, the factory MUST default the value to `false` (preserving the opt-in safe default from the DB layer). The default MUST be `false` regardless of any other doctor field at creation time — a fresh doctor who has never toggled the switch MUST be created with `aceptaOnline === false`.

The factory MUST NOT validate the `aceptaOnline` argument as anything other than a boolean (any boolean is valid — the field is a pure preference flag with no business rules attached at the entity level). The factory MUST NOT change any other field, MUST NOT change the order of existing required arguments, and MUST NOT change the return shape — the new argument is purely additive.

The `aceptaOnline` field is the doctor-side mirror of `Cita.modalidad`: a doctor who is `aceptaOnline === true` MAY receive ONLINE citas; a doctor who is `aceptaOnline === false` MUST NOT. This invariant is enforced at the use-case layer (see `booking-api/spec.md` REQ-BA-MOD-2), NOT at the entity layer (the entity does not check itself against citas).

#### Scenario: Doctor defaults to false when aceptaOnline is omitted

- GIVEN a `create()` call with the original pre-change arguments (no `aceptaOnline`)
- WHEN the factory is invoked
- THEN the resulting `Doctor` MUST have `aceptaOnline === false`
- AND `verificado`, `calificacionMedia`, and all other fields MUST be unchanged from the pre-change behavior

#### Scenario: Doctor accepts true when aceptaOnline is passed

- GIVEN a `create()` call with `aceptaOnline: true`
- WHEN the factory is invoked
- THEN the resulting `Doctor` MUST have `aceptaOnline === true`

#### Scenario: Boolean coercion is the only validation

- GIVEN a `create()` call with `aceptaOnline: false`
- WHEN the factory is invoked
- THEN the resulting `Doctor` MUST have `aceptaOnline === false`
- AND the factory MUST NOT throw (the value is a valid boolean, regardless of what business rule applies downstream)

#### Scenario: Pre-existing factory call sites compile unchanged

- GIVEN any call site that calls `Doctor.create({ ... })` without an `aceptaOnline` key
- WHEN the codebase is type-checked
- THEN the call MUST compile (the field is optional with a default of `false`)
- AND the call site MUST NOT require a code change to keep compiling
