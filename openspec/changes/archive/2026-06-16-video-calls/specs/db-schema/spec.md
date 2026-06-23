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
