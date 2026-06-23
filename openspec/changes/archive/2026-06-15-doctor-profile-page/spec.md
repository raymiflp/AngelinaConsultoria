# Doctor Profile Page Specification

## Purpose

Define the upgrade of the public doctor profile page at `/doctores/[id]` from a single-card layout to a rich, multi-section profile page with Hero, Experience, Services, and Treated Conditions sections. Phase 1 covers professional data display only — reviews, insurance, FAQ, maps, and edit UI are deferred to later phases.

## Requirements

### Requirement: Backward Compatibility

The existing `getDoctorProfile` procedure and `DoctorPublicResponse` type MUST remain unchanged. The `DoctorCard` component MUST continue working for the `/doctores` listing page. No changes to the listing page, its query, or its rendering are permitted in this phase.

#### Scenario: Existing endpoint continues to work

- GIVEN an existing `DoctorPublicResponse` consumer (`/doctores` listing page)
- WHEN `getDoctorProfile` is called with a valid doctorId
- THEN the response MUST be identical to the pre-change response (id, nombre, email, especialidad, biografia, precioConsulta, calificacionMedia)

#### Scenario: DoctorCard unchanged on listing page

- GIVEN the `/doctores` listing page renders DoctorCard components
- WHEN the page loads after this change
- THEN each DoctorCard MUST render with the same 7-field layout and no new fields

### Requirement: DB Schema — Doctor Table Extensions

The `doctores` table MUST be extended with 5 new columns to support the Hero section and profile metadata: `foto_url`, `ubicacion_consulta`, `años_experiencia`, `idiomas`, `telefono_consulta`. These columns are optional (nullable) to allow partial data entry until the doctor edit UI exists (Phase 3).

#### Scenario: Migration adds all new columns

- GIVEN the current `doctores` table schema
- WHEN the migration runs
- THEN the table MUST have these new nullable columns:
  - `foto_url` — varchar (external URL for the doctor's profile photo)
  - `ubicacion_consulta` — text (free-form consultation address / city)
  - `años_experiencia` — integer (years of professional experience)
  - `idiomas` — text[] (PostgreSQL text array of spoken languages)
  - `telefono_consulta` — varchar (direct consultation phone line)

#### Scenario: Existing queries unaffected by migration

- GIVEN the migration has been applied
- WHEN `getDoctorProfile` (existing procedure) executes its SELECT against `doctores`
- THEN the query MUST NOT break — the new columns are simply not selected

### Requirement: DB Schema — New Tables

Three new tables MUST be created: `doctor_experiencia` (education/work history), `doctor_servicios` (service catalog with pricing), and `doctor_condiciones` (treated conditions as tags). All tables MUST reference `doctores.id` via foreign key with `onDelete: cascade`.

#### Scenario: doctor_experiencia table structure

- GIVEN the migration has been applied
- WHEN inspecting the `doctor_experiencia` table
- THEN it MUST have these columns:
  - `id` — uuid PK, defaultRandom()
  - `doctor_id` — uuid, NOT NULL, FK → doctores(id) CASCADE
  - `tipo` — varchar, NOT NULL, values `"education"` | `"work"`
  - `titulo` — varchar, NOT NULL
  - `institucion` — varchar, NOT NULL
  - `fecha_inicio` — date, NOT NULL
  - `fecha_fin` — date, nullable (null = present/current)
  - `descripcion` — text, nullable
  - `orden` — integer, NOT NULL, default 0
  - `created_at` — timestamp, default now(), NOT NULL

#### Scenario: doctor_servicios table structure

- GIVEN the migration has been applied
- WHEN inspecting the `doctor_servicios` table
- THEN it MUST have these columns:
  - `id` — uuid PK, defaultRandom()
  - `doctor_id` — uuid, NOT NULL, FK → doctores(id) CASCADE
  - `nombre` — varchar, NOT NULL
  - `descripcion` — text, nullable
  - `precio` — numeric, NOT NULL
  - `duracion_minutos` — integer, nullable
  - `activo` — boolean, NOT NULL, default true
  - `orden` — integer, NOT NULL, default 0
  - `created_at` — timestamp, default now(), NOT NULL

#### Scenario: doctor_condiciones table structure

- GIVEN the migration has been applied
- WHEN inspecting the `doctor_condiciones` table
- THEN it MUST have these columns:
  - `id` — uuid PK, defaultRandom()
  - `doctor_id` — uuid, NOT NULL, FK → doctores(id) CASCADE
  - `nombre` — varchar, NOT NULL
  - `created_at` — timestamp, default now(), NOT NULL

#### Scenario: Foreign key cascading deletes

- GIVEN a doctor record with 2 experience entries, 3 services, and 5 conditions
- WHEN the doctor record is deleted
- THEN all associated experience, service, and condition rows MUST be deleted automatically

### Requirement: DB Schema — Indexes on New Tables

Each new table MUST have an index on `doctor_id` for efficient per-doctor lookups, matching the existing pattern used by `doctorDisponibilidad` and other FK-indexed tables.

#### Scenario: Indexes exist on foreign key columns

- GIVEN the migration has been applied
- WHEN inspecting the new tables' indexes
- THEN `doctor_experiencia` MUST have an index on `doctor_id`
- AND `doctor_servicios` MUST have an index on `doctor_id`
- AND `doctor_condiciones` MUST have an index on `doctor_id`

### Requirement: DB Schema — Drizzle Schema Relations

The `doctoresRelations` definition MUST be extended with `many` relations to the three new tables. Each new table MUST have a `one` relation back to `doctores` matching the existing pattern of `doctorDisponibilidadRelations`.

#### Scenario: New relations are queryable via Drizzle

- GIVEN a `db.query.doctores.findFirst({ with: { ... } })` call
- WHEN the query includes the new relation keys
- THEN experience, services, and conditions MUST be resolvable via Drizzle's relational query API

### Requirement: Domain Entity — Doctor Extension

The `Doctor` entity MUST be extended with 5 new readonly fields: `fotoUrl`, `ubicacionConsulta`, `añosExperiencia`, `idiomas`, `telefonoConsulta`. The `create()` factory MUST accept them as optional properties. Existing validation rules MUST NOT change.

#### Scenario: Doctor entity constructed with new optional fields

- GIVEN a valid `create()` call with all new fields provided
- WHEN the entity is constructed
- THEN `fotoUrl` MUST be the trimmed URL string
- AND `ubicacionConsulta` MUST be the trimmed address string
- AND `añosExperiencia` MUST be the number of years
- AND `idiomas` MUST be a string array
- AND `telefonoConsulta` MUST be the trimmed phone string

#### Scenario: Doctor entity constructed without new fields

- GIVEN a valid `create()` call without any new fields
- WHEN the entity is constructed
- THEN `fotoUrl` MUST be `undefined`
- AND `ubicacionConsulta` MUST be `undefined`
- AND `añosExperiencia` MUST be `undefined`
- AND `idiomas` MUST be `undefined`
- AND `telefonoConsulta` MUST be `undefined`

#### Scenario: añosExperiencia out of range

- GIVEN a `create()` call with `añosExperiencia: -1`
- WHEN the entity is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: Domain Entity — DoctorExperience

The system MUST define a `DoctorExperience` entity with readonly properties: `id`, `doctorId`, `tipo` ("education" | "work"), `titulo`, `institucion`, `fechaInicio`, `fechaFin` (optional), `descripcion` (optional), `orden`. The `create()` factory MUST validate non-empty required fields and valid `tipo` values.

#### Scenario: Valid education entry

- GIVEN valid props for an education entry (tipo="education")
- WHEN `DoctorExperience.create()` is called
- THEN the entity MUST have all fields assigned AND `tipo` MUST be `"education"`

#### Scenario: Valid work entry

- GIVEN valid props for a work entry (tipo="work")
- WHEN `DoctorExperience.create()` is called
- THEN the entity MUST have all fields assigned AND `tipo` MUST be `"work"`

#### Scenario: Invalid tipo rejected

- GIVEN a `tipo` value of `"certification"`
- WHEN `DoctorExperience.create()` is called
- THEN a `ValidationError` MUST be thrown

#### Scenario: Empty titulo rejected

- GIVEN a `create()` call with `titulo: ""`
- WHEN the entity is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: Domain Entity — DoctorService

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

### Requirement: Domain Entity — DoctorCondition

The system MUST define a `DoctorCondition` entity with readonly properties: `id`, `doctorId`, `nombre`. The `create()` factory MUST validate `nombre` is non-empty.

#### Scenario: Valid condition construction

- GIVEN a non-empty `nombre`
- WHEN `DoctorCondition.create()` is called
- THEN the entity MUST have all fields assigned

#### Scenario: Empty nombre rejected

- GIVEN `nombre: ""`
- WHEN `DoctorCondition.create()` is called
- THEN a `ValidationError` MUST be thrown

### Requirement: New Response Type — DoctorFullProfileResponse

The system MUST define a new `DoctorFullProfileResponse` type that extends the concept of `DoctorPublicResponse` with hero fields and section data. This type is used ONLY by the `getDoctorFullProfile` and `getDoctorServices` endpoints — `DoctorPublicResponse` MUST remain unchanged.

#### Scenario: DoctorFullProfileResponse structure

- GIVEN a valid doctor with all data
- WHEN `getDoctorFullProfile` resolves
- THEN the response MUST have this shape:
  - `id` — string (UUID)
  - `nombre` — string
  - `email` — string
  - `especialidad` — string
  - `biografia` — string | null
  - `precioConsulta` — number | null
  - `calificacionMedia` — number | null
  - `fotoUrl` — string | null
  - `ubicacionConsulta` — string | null
  - `añosExperiencia` — number | null
  - `idiomas` — string[]
  - `telefonoConsulta` — string | null
  - `numeroColegiado` — string
  - `totalReviews` — number (0 until Phase 2 review system is built)
  - `experience` — Array of `{ id, tipo, titulo, institucion, fechaInicio, fechaFin, descripcion, orden }`
  - `services` — Array of `{ id, nombre, descripcion, precio, duracionMinutos, activo, orden }`
  - `conditions` — Array of `{ id, nombre }`

### Requirement: New tRPC Procedure — getDoctorFullProfile

The system MUST expose a new public tRPC procedure `getDoctorFullProfile` under the `profilesRouter` that returns ALL Phase 1 data (profile + hero fields + experience + services + conditions) in a single query. The procedure MUST be public (no authentication required).

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

### Requirement: New tRPC Procedure — getDoctorServices

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

### Requirement: UI Component — DoctorHero

The system MUST render a Hero section at the top of the doctor profile page displaying: doctor photo (or fallback initials), full name, specialty badge, consultation location, license number (`Nº Colegiado`), years of experience, spoken languages, average rating with review count, phone number, and CTA buttons (Book appointment, Call, Message). The component SHALL use shadcn Avatar, Badge, Card, and Button primitives.

#### Scenario: Hero renders all available fields

- GIVEN a doctor with complete data (photo URL, location, languages, phone, rating)
- WHEN `DoctorHero` renders
- THEN it MUST display the photo via Avatar with `src` set to `fotoUrl`
- AND the full name as a heading
- AND the specialty as a Badge
- AND the consultation location text
- AND "Nº Colegiado: {numeroColegiado}"
- AND "{añosExperiencia} años de experiencia"
- AND language badges or comma-separated text
- AND the average rating (star icon + number) with "({totalReviews} reseñas)"
- AND the phone number as clickable text (tel: link)
- AND three CTA buttons: "Reservar cita", "Llamar", "Mensaje"

#### Scenario: Hero falls back to initials when no photo URL

- GIVEN a doctor with `fotoUrl` set to null
- WHEN `DoctorHero` renders
- THEN the Avatar MUST NOT have a `src` prop
- AND `AvatarFallback` MUST display the initials derived from the doctor's name (2 uppercase letters)

#### Scenario: CTA visibility for unauthenticated users

- GIVEN an unauthenticated user
- WHEN `DoctorHero` renders
- THEN the "Reservar cita" button MUST be visible and navigable (may redirect to login or prompt auth)
- AND the "Llamar" and "Mensaje" buttons MUST be visible

#### Scenario: CTA visibility for authenticated patients

- GIVEN an authenticated user with rol=PACIENTE
- WHEN `DoctorHero` renders
- THEN all three CTA buttons MUST be visible and functional
- AND "Reservar cita" MUST link to `/doctores/{id}/agendar`

#### Scenario: CTA visibility for authenticated doctors/admins

- GIVEN an authenticated user with rol=DOCTOR or rol=ADMIN
- WHEN `DoctorHero` renders
- THEN the "Reservar cita" button SHOULD be hidden
- AND "Llamar" and "Mensaje" buttons MAY render (visual only; actual messaging is out of scope)

#### Scenario: Fields gracefully handle null/undefined

- GIVEN a doctor with null location, null experience, no languages, null phone
- WHEN `DoctorHero` renders
- THEN the missing fields MUST NOT render at all (no empty labels, no "null" text, no broken layout)

#### Scenario: Loading skeleton for hero

- GIVEN the `DoctorFullProfile` query is in flight
- WHEN the page renders
- THEN a skeleton placeholder matching the hero layout MUST display (Avatar circle, text lines, button rectangles) using the existing Skeleton component

### Requirement: UI Component — DoctorExperience

The system MUST render an Experience section showing education entries (degree, institution, year range) and work history entries (position, company, year range). Entries MUST be sorted by `orden` ASC then `fecha_inicio` DESC (most recent first). The section SHALL visually distinguish between education and work entries, typically with icons or labels.

#### Scenario: Experience renders with mixed education and work entries

- GIVEN a doctor with 2 education entries and 2 work entries
- WHEN `DoctorExperience` renders
- THEN all 4 entries MUST be visible
- AND education entries MUST show a graduation cap icon (or "Educación" label)
- AND work entries MUST show a briefcase icon (or "Experiencia" label)
- AND each entry MUST display: titulo, institucion, and date range (formatted as "YYYY – YYYY" or "YYYY – Presente" for current)

#### Scenario: Chronological order

- GIVEN experience entries with varied dates
- WHEN `DoctorExperience` renders
- THEN entries MUST be ordered by `orden` ASC first, then `fecha_inicio` DESC

#### Scenario: Current position shown with "Presente"

- GIVEN a work entry with `fechaFin` set to null
- WHEN `DoctorExperience` renders
- THEN the date range MUST display as "{fechaInicio year} – Presente"

#### Scenario: Empty state

- GIVEN a doctor with no experience entries
- WHEN `DoctorExperience` renders
- THEN the section MUST display "Sin experiencia registrada" or equivalent empty message

#### Scenario: Loading skeleton

- GIVEN the query is in flight
- WHEN the page renders
- THEN skeleton placeholders for multiple experience timeline entries MUST display

### Requirement: UI Component — DoctorServices

The system MUST render a Services & Prices section showing individual services with name, description, price formatted in euros (€), and duration. Services MUST be sorted by `orden` ASC and only active services (`activo=true`) SHALL be displayed. Each service SHOULD have a "Reservar" button for future per-service booking (non-functional in Phase 1).

#### Scenario: Services list renders with correct data

- GIVEN a doctor with 3 active services
- WHEN `DoctorServices` renders
- THEN each service MUST display: the service name, description text, price formatted as "{precio.toFixed(2)} €", duration as "{duracionMinutos} min" (if present), and a "Reservar" button (non-functional, visual only)

#### Scenario: Inactive services hidden

- GIVEN a doctor with 2 active and 1 inactive service
- WHEN `DoctorServices` renders
- THEN only 2 services MUST be visible
- AND the inactive service MUST NOT appear in the DOM

#### Scenario: Service without duration

- GIVEN a service with `duracionMinutos` set to null
- WHEN `DoctorServices` renders
- THEN the duration label MUST NOT render
- AND the layout MUST NOT break

#### Scenario: Empty state

- GIVEN a doctor with no services configured
- WHEN `DoctorServices` renders
- THEN the section MUST display "No hay servicios configurados" or equivalent empty message

#### Scenario: Loading skeleton

- GIVEN the query is in flight
- WHEN the page renders
- THEN skeleton placeholders for multiple service cards MUST display

### Requirement: UI Component — DoctorConditions

The system MUST render a Treated Conditions section showing conditions/diseases the doctor treats, rendered as a tag cloud using shadcn Badge (secondary variant) or similar tag components.

#### Scenario: Conditions render as a tag cloud

- GIVEN a doctor with 8 conditions listed
- WHEN `DoctorConditions` renders
- THEN all 8 conditions MUST display as individual tags/badges
- AND tags MUST be laid out in a wrapping flex container (no horizontal scroll)

#### Scenario: Empty state

- GIVEN a doctor with no conditions listed
- WHEN `DoctorConditions` renders
- THEN the section MUST display "No hay condiciones registradas" or equivalent empty message

#### Scenario: Loading state

- GIVEN the query is in flight
- WHEN the page renders
- THEN skeleton placeholder badges (small rounded rectangles) MUST display in a wrapping layout

### Requirement: UI Component — DoctorProfileSkeleton

The system MUST provide a full-page skeleton component (`DoctorProfileSkeleton`) that matches the multi-section layout of the new doctor detail page. This replaces the existing single-card `DoctorCardSkeleton`.

#### Scenario: Skeleton matches multi-section layout

- GIVEN the query is loading
- WHEN `DoctorProfileSkeleton` renders
- THEN it MUST display skeleton shapes for: Hero section (avatar circle, title line, subtitle lines, button rectangles), Experience section (timeline-like shapes), Services section (card-like shapes), and Conditions section (small rounded rectangles in a wrapping layout)

### Requirement: UI — Page Layout Rewrite

The `DoctorDetailPage` at `src/app/doctores/[id]/page.tsx` MUST be rewritten to compose the four new section components (`DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`) in a vertical layout. The page MUST fetch data via the new `getDoctorFullProfile` endpoint. Existing error/not-found states (Alert + back button) MUST be preserved.

#### Scenario: Multi-section layout renders

- GIVEN a valid doctor with complete data
- WHEN the page renders after successful data fetch
- THEN the page MUST display in order:
  1. Back link ("Volver a la lista" → `/doctores`)
  2. DoctorHero section
  3. DoctorExperience section
  4. DoctorServices section
  5. DoctorConditions section
- AND sections MUST be separated by consistent vertical spacing (e.g., `space-y-8`)

#### Scenario: Loading state

- GIVEN the query is in flight
- WHEN the page renders
- THEN `DoctorProfileSkeleton` MUST be displayed instead of individual section skeletons

#### Scenario: Error / not-found state preserved

- GIVEN a non-existent doctorId
- WHEN `getDoctorFullProfile` rejects with NOT_FOUND
- THEN the page MUST display the existing Alert (variant="destructive") with "Doctor no encontrado" message and a "Volver" button

#### Scenario: Network error

- GIVEN the query fails with a network/server error
- WHEN the page renders
- THEN the existing Alert with error message and "Volver" button MUST display
