# DB Schema Specification

## Purpose

Define the Drizzle ORM schema mapping all domain entities to PostgreSQL tables, the Drizzle Kit configuration for migration generation, and the database client initialization with connection pooling. Each table MUST map one-to-one with its corresponding domain entity. Schema definitions are the BRIDGE between the pure domain and the database — they MUST mirror entity fields but MAY add Drizzle-specific column types and constraints.

## Requirements

### Requirement: Drizzle Configuration

The system MUST provide a `drizzle.config.ts` file at `src/infrastructure/db/` that specifies PostgreSQL as the dialect, the schema directory path, the output directory for migrations (`src/infrastructure/db/migrations/`), and reads the database URL from `DATABASE_URL` environment variable.

#### Scenario: Configuration loads correctly

- GIVEN a valid `DATABASE_URL` environment variable pointing to a PostgreSQL instance
- WHEN `drizzle-kit generate` is invoked
- THEN it MUST read the config and connect without errors

#### Scenario: Missing DATABASE_URL

- GIVEN no `DATABASE_URL` environment variable
- WHEN `drizzle.config.ts` is loaded
- THEN the system MUST throw an error referencing the missing variable

### Requirement: Schema Definitions for All Entities

The system MUST define Drizzle table schemas in `src/infrastructure/db/schema/` for all domain entities: `usuarios`, `doctores`, `pacientes`, `citas`, `audit_logs`, `consentimientos`, `doctor_experiencia`, `doctor_servicios`, `doctor_condiciones`. Each schema MUST use Drizzle column types (`uuid`, `text`, `varchar`, `timestamp`, `boolean`, `numeric`, `jsonb`) and MUST declare primary keys, foreign keys, unique constraints, and sensible defaults matching entity invariants.

#### Scenario: Usuarios table schema

- GIVEN the `usuarios` table definition
- WHEN inspected
- THEN it MUST have columns: `id` (uuid PK), `email` (varchar unique), `password_hash` (text), `role` (varchar), `nombre` (varchar), `telefono` (varchar), `activo` (boolean default true), `created_at` (timestamp default now), `updated_at` (timestamp)

#### Scenario: Doctores table with foreign key

- GIVEN the `doctores` table definition
- WHEN inspected
- THEN it MUST have a foreign key to `usuarios.id` AND a unique constraint on `numero_colegiado`

#### Scenario: Citas table with dual foreign keys

- GIVEN the `citas` table definition
- WHEN inspected
- THEN it MUST have foreign keys to both `doctores.id` and `pacientes.id` AND `estado` must default to `'PENDIENTE'`

#### Scenario: Audit logs use jsonb for details

- GIVEN the `audit_logs` table definition
- WHEN inspected
- THEN the `detalles` column MUST be `jsonb` (nullable)

#### Scenario: Consentimientos expiration constraint

- GIVEN the `consentimientos` table definition
- WHEN inspected
- THEN `fecha_aceptacion` and `fecha_expiracion` MUST be nullable timestamps

#### Scenario: Doctores table extended with profile columns

- GIVEN the `doctores` table definition
- WHEN inspected after the profile page migration
- THEN the table MUST have 5 additional nullable columns: `foto_url` (varchar), `ubicacion_consulta` (text), `años_experiencia` (integer), `idiomas` (text[] array), `telefono_consulta` (varchar)
- AND all 5 columns MUST be nullable (no `notNull()`)
- AND existing columns MUST be untouched

#### Scenario: doctor_experiencia table

- GIVEN the `doctor_experiencia` table definition
- WHEN inspected
- THEN it MUST have columns: `id` (uuid PK), `doctor_id` (uuid FK → doctores CASCADE), `tipo` (varchar), `titulo` (varchar), `institucion` (varchar), `fecha_inicio` (date), `fecha_fin` (date nullable), `descripcion` (text nullable), `orden` (integer default 0), `created_at` (timestamp default now)
- AND it MUST have an index on `doctor_id`

#### Scenario: doctor_servicios table

- GIVEN the `doctor_servicios` table definition
- WHEN inspected
- THEN it MUST have columns: `id` (uuid PK), `doctor_id` (uuid FK → doctores CASCADE), `nombre` (varchar), `descripcion` (text nullable), `precio` (numeric), `duracion_minutos` (integer nullable), `activo` (boolean default true), `orden` (integer default 0), `created_at` (timestamp default now)
- AND `precio` MUST use `numeric` type (supports decimal values)
- AND it MUST have an index on `doctor_id`

#### Scenario: doctor_condiciones table

- GIVEN the `doctor_condiciones` table definition
- WHEN inspected
- THEN it MUST have columns: `id` (uuid PK), `doctor_id` (uuid FK → doctores CASCADE), `nombre` (varchar), `created_at` (timestamp default now)
- AND it MUST have an index on `doctor_id`

### Requirement: DB Client Initialization

The system MUST provide a DB client factory in `src/infrastructure/db/index.ts` that creates a Drizzle instance using `postgres.js` connection pool. The pool MUST be configured with the `DATABASE_URL`, SHALL use a maximum of 10 connections, and MUST support SSL for production connections. The factory MUST return a typed `drizzle-orm/postgres-js` instance with all schema imports.

#### Scenario: DB client connects

- GIVEN a running PostgreSQL instance with valid credentials
- WHEN the DB client factory is called
- THEN it MUST return a Drizzle instance ready to execute queries

#### Scenario: Schema imports complete

- GIVEN the DB client factory
- WHEN inspected
- THEN it MUST import and expose all 9 table schemas as part of the typed Drizzle schema

### Requirement: Migration Generation

The system MUST use `drizzle-kit generate` to produce timestamped SQL migration files in `src/infrastructure/db/migrations/`. Each migration MUST be a complete DDL script (CREATE TABLE IF NOT EXISTS, ALTER, etc.) that can be applied to a fresh PostgreSQL database. The system MUST provide an npm script `db:migrate` that applies pending migrations.

#### Scenario: Migration generates all tables

- GIVEN the schema definitions are complete
- WHEN `drizzle-kit generate` runs
- THEN it MUST produce a single migration file containing CREATE TABLE statements for all 9 tables with all columns, keys, and constraints

#### Scenario: Migration applies cleanly

- GIVEN a fresh PostgreSQL database
- WHEN the generated migration is applied
- THEN all 9 tables exist with correct columns, foreign keys, and indices

## Video Calls Additions (2026-06-16)

The following requirement is ADDED to the db-schema spec by the `2026-06-16-video-calls` change. The column is reserved for future flexibility (explicit room naming, persistence, audit trail); in MVP the live room name is derived from `cita.id` server-side via the `Cita.livekitRoomName` getter (see `domain-entities/spec.md` REQ-DE-VC-1). The column is unused at runtime in this change — it exists so the schema can be extended later without a follow-up migration.

### Requirement: citas.livekit_room_name column

The `citas` table MUST be extended with a new nullable column `livekit_room_name` of type `varchar(128)`. The column MUST be nullable (no `NOT NULL` constraint). The column MUST have a default value of `NULL` (no implicit empty-string default — `NULL` is the explicit pre-write state). The column MUST NOT have a unique constraint, a foreign key, or an index in v1 (none of those are needed because the getter derives the room name on the server, not from the column).

The migration MUST be a new file under `src/infrastructure/db/migrations/` with the Drizzle-generated name `0003_*.sql` (or the next available sequence number — the Drizzle Kit convention is to assign the next integer; the exact filename hash is generated by Drizzle). The migration's UP step MUST be `ALTER TABLE citas ADD COLUMN livekit_room_name varchar(128)`. The migration's DOWN step MUST be `ALTER TABLE citas DROP COLUMN livekit_room_name` (so a rollback in dev is a single command).

No backfill is required: existing cita rows keep `livekit_room_name = NULL` and the `Cita.livekitRoomName` getter ignores the column.

#### Scenario: Column is added by the migration

- GIVEN the change is applied and `pnpm db:migrate` runs
- WHEN the `citas` table is inspected in PostgreSQL
- THEN a `livekit_room_name` column of type `varchar(128)` MUST be present
- AND the column MUST be nullable
- AND no default value other than `NULL` MUST be set

#### Scenario: Existing rows are not backfilled

- GIVEN pre-existing cita rows in the database
- WHEN the migration applies
- THEN those rows MUST have `livekit_room_name = NULL`
- AND no UPDATE statement SHALL run as part of the migration

#### Scenario: Migration is reversible

- GIVEN the migration has been applied
- WHEN the migration is reverted (`drizzle-kit rollback` or the equivalent)
- THEN the `livekit_room_name` column MUST be dropped
- AND no data outside this column SHALL be affected (the drop is column-scoped, not table-scoped)

#### Scenario: Citas table retains all prior columns and constraints

- GIVEN the change is applied
- WHEN the `citas` table is inspected
- THEN the existing foreign keys to `doctores.id` and `pacientes.id` MUST remain
- AND the existing `estado` default of `'PENDIENTE'` MUST remain
- AND all prior columns MUST be untouched

#### Scenario: No new index or unique constraint

- GIVEN the change is applied
- WHEN the `citas` table is inspected
- THEN no new index on `livekit_room_name` MUST exist
- AND no unique constraint on `livekit_room_name` MUST exist
- AND no foreign key referencing `livekit_room_name` MUST exist

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the db-schema spec by the `2026-06-19-modality-toggle` change. The two new columns (`citas.modalidad` and `doctores.acepta_online`) ship in migration `0004_*.sql` (the next available sequence number after `0003_*.sql`). Both columns follow the two-statement pattern: `ADD COLUMN ... DEFAULT ... NOT NULL` (atomic backfill) followed by `ALTER COLUMN ... DROP DEFAULT` (enforce explicit writes). The columns are required at the schema level (NOT NULL) but the Drizzle default is preserved for ergonomic inserts in dev and test fixtures.

### Requirement: REQ-DB-MOD-1 — citas.modalidad column

The `citas` table MUST be extended with a new column `modalidad` of type `varchar(20)`. The column MUST be declared `NOT NULL` in the Drizzle schema. The Drizzle column MUST carry `default('PRESENCIAL')` so dev and test fixtures can omit the field; the runtime migration MUST drop that default (see REQ-DB-MOD-3). The column MUST be a `varchar(20)` to match the existing `estado` column pattern and to leave room for a future third modality (length 20 is generous for `"PRESENCIAL"`, `"ONLINE"`, and a hypothetical `"DOMICILIO"`).

The column MUST NOT have a unique constraint (modalities are not unique per cita — many citas share the same modality). The column MUST NOT have a foreign key (modalities are an in-code string union, not a referenced table — see AD-2 in the proposal). The column MUST NOT have an index in v1 (filter-by-modality is a UI-side concern, not a query-hot path; if a future change adds an index, it lands in that change's spec).

#### Scenario: Column is present in the citas table

- GIVEN the change is applied and `pnpm db:migrate` runs
- WHEN the `citas` table is inspected in PostgreSQL
- THEN a `modalidad` column of type `varchar(20)` MUST be present
- AND the column MUST be `NOT NULL` (the schema enforces this; an INSERT without a value MUST fail at the DB level)
- AND the column MUST NOT have a permanent default (the `DROP DEFAULT` from the migration has been applied)

#### Scenario: Column accepts only the two documented values at runtime

- GIVEN the Drizzle schema with the union `'PRESENCIAL' | 'ONLINE'`
- WHEN an INSERT attempts `modalidad = 'INVALID'`
- THEN the application-layer Zod validation MUST reject the value with `BAD_REQUEST` (the DB column itself is `varchar(20)` and accepts any string up to 20 chars — type safety is the application's responsibility, NOT the DB's; this matches the existing `estado` pattern)

#### Scenario: Existing citas table is otherwise untouched

- GIVEN the change is applied
- WHEN the `citas` table is inspected
- THEN the existing foreign keys to `doctores.id` and `pacientes.id` MUST remain
- AND the existing `estado` default of `'PENDIENTE'` MUST remain
- AND `livekit_room_name` (added in 2026-06-16) MUST remain untouched
- AND no other column MUST be modified

### Requirement: REQ-DB-MOD-2 — doctores.acepta_online column

The `doctores` table MUST be extended with a new column `acepta_online` of type `boolean`. The column MUST be declared `NOT NULL` in the Drizzle schema. The Drizzle column MUST carry `default(false)` so fresh inserts in dev and test fixtures get the safe opt-in default; the runtime migration MUST drop that default (see REQ-DB-MOD-3). The column MUST mirror the existing `verificado: boolean('verificado').default(false).notNull()` pattern on the same table (both are opt-in booleans with a safe default of `false`).

The column MUST NOT have a unique constraint (a boolean is a scalar and uniqueness is meaningless). The column MUST NOT have a foreign key (the column is a property of the doctor, not a reference to another row). The column MUST NOT have an index in v1 (the listing filter on `?aceptaOnline=true` is a low-cardinality lookup — see `profiles-api/spec.md` REQ-PA-MOD-3 — and Postgres seq-scan over a small `doctores` table is acceptable for MVP; if a future change adds an index, it lands in that change's spec).

#### Scenario: Column is present in the doctores table

- GIVEN the change is applied and `pnpm db:migrate` runs
- WHEN the `doctores` table is inspected in PostgreSQL
- THEN an `acepta_online` column of type `boolean` MUST be present
- AND the column MUST be `NOT NULL`
- AND the column MUST NOT have a permanent default at the DB level (the `DROP DEFAULT` from the migration has been applied)

#### Scenario: Existing doctor rows are backfilled to false

- GIVEN pre-existing doctor rows in the database
- WHEN the migration applies
- THEN every existing row MUST have `acepta_online = false`
- AND the backfill MUST happen in the same statement as the `ADD COLUMN` (no separate `UPDATE` step)

#### Scenario: Existing doctores table is otherwise untouched

- GIVEN the change is applied
- WHEN the `doctores` table is inspected
- THEN the existing foreign key to `usuarios.id` MUST remain
- AND the existing unique constraint on `numero_colegiado` MUST remain
- AND the existing 5 profile columns (`foto_url`, `ubicacion_consulta`, `años_experiencia`, `idiomas`, `telefono_consulta`) MUST remain untouched
- AND no other column MUST be modified

### Requirement: REQ-DB-MOD-3 — Migration backfill strategy (two-statement pattern)

The migration MUST be a new file under `src/infrastructure/db/migrations/` with the Drizzle-generated name `0004_*.sql` (the next available sequence number after `0003_*.sql` from the video-calls change). The migration MUST contain four DDL statements, executed in this order, all inside the project's standard migration transaction:

1. `ALTER TABLE "citas" ADD COLUMN "modalidad" varchar(20) DEFAULT 'PRESENCIAL' NOT NULL;`
2. `ALTER TABLE "citas" ALTER COLUMN "modalidad" DROP DEFAULT;`
3. `ALTER TABLE "doctores" ADD COLUMN "acepta_online" boolean DEFAULT false NOT NULL;`
4. `ALTER TABLE "doctores" ALTER COLUMN "acepta_online" DROP DEFAULT;`

Statements 1 and 3 backfill all existing rows in a single atomic pass (Postgres ≥ 11 acquires an `ACCESS EXCLUSIVE` lock and rewrites the table in one pass — no separate `UPDATE` step, no risk of forgetting a row). Statements 2 and 4 drop the column-level default so new inserts MUST specify a value explicitly; accidental `INSERT`s from a future migration or admin script that omit the column MUST fail loudly with a `NOT NULL` violation instead of silently defaulting to `PRESENCIAL` / `false`. The Drizzle schema (`citas.ts`, `doctores.ts`) keeps the `default(...)` declaration for ergonomic dev/test inserts; the migration is the runtime authority on what the production schema actually enforces.

The migration's DOWN step MUST reverse the four statements in reverse order: drop the default, then drop the column — for both `citas.modalidad` and `doctores.acepta_online`. The DOWN MUST be a clean four-statement rollback with no data loss outside the two new columns.

#### Scenario: Forward migration adds both columns and drops both defaults

- GIVEN a PostgreSQL database with the pre-change schema
- WHEN `pnpm db:migrate` runs
- THEN the migration MUST execute statements 1-4 in order, inside a single transaction
- AND the `citas` table MUST end with `modalidad varchar(20) NOT NULL` and no column default
- AND the `doctores` table MUST end with `acepta_online boolean NOT NULL` and no column default
- AND every pre-existing row in `citas` MUST have `modalidad = 'PRESENCIAL'`
- AND every pre-existing row in `doctores` MUST have `acepta_online = false`

#### Scenario: Reverse migration removes both columns

- GIVEN the migration has been applied
- WHEN the migration is reverted
- THEN the four columns MUST be dropped in reverse order
- AND no data outside the two new columns SHALL be affected
- AND the pre-change `citas` and `doctores` schemas MUST be exactly restored

#### Scenario: New inserts MUST specify modality explicitly

- GIVEN the migration has been applied (so the column default is dropped)
- WHEN an INSERT statement omits the `modalidad` column
- THEN PostgreSQL MUST reject the statement with a `NOT NULL` violation
- AND the same MUST apply to an INSERT that omits `acepta_online`

#### Scenario: Drizzle default is preserved for dev/test ergonomics

- GIVEN the Drizzle schema in `src/infrastructure/db/schema/citas.ts` and `doctores.ts`
- WHEN inspected
- THEN `modalidad` MUST be declared `notNull().default('PRESENCIAL')` in the Drizzle code
- AND `acepta_online` MUST be declared `notNull().default(false)` in the Drizzle code
- AND this default is the Drizzle ORM's per-insert convenience, NOT the DB-level default (the migration drops the DB default)
- AND a `pnpm db:push` to a fresh dev database MUST succeed with the Drizzle defaults, even without the migration applied
