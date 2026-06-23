# Capability: dev-seed

## Purpose

Define the behavior of the `pnpm seed:dev` command — the idempotent script that bootstraps a local development environment with one doctor, one patient, and one cita `ONLINE` scheduled 5 minutes in the future. The seed exists so a new operator can reproduce the MVP flow (doctor and patient joining the same video call) without manually creating users, waiting for email confirmation, navigating the booking flow, or hand-copying IDs. The script is the prerequisite for the E2E test (see `e2e-video-call`) and for the manual smoke test in `docs/dev-setup.md`.

## Requirements

### REQ-DEV-SEED-1: Script creates exactly two users on first run

The `pnpm seed:dev` command (which runs `tsx scripts/seed-dev.ts`) MUST create exactly two users in the `usuarios` table if they do not already exist, using `INSERT ... ON CONFLICT (email) DO NOTHING` for idempotency. The first user MUST be a doctor with:

- `email` = `"doctor.dev@angelina.local"`
- `password` (hashed via bcryptjs 12 rounds — same pattern as `src/infrastructure/auth/password.ts`) = `"DoctorDev123!"`
- `rol` = `"DOCTOR"`
- `nombre` and `apellido` populated with non-empty strings (any values — the script MAY use the literal `"Doctor"` / `"Dev"`)

The doctor profile (`doctores` table) MUST be filled with `aceptaOnline: true` and at least one availability block (e.g. Monday 09:00–18:00 local time) so the doctor can be selected by the booking UI.

The second user MUST be a paciente with:

- `email` = `"paciente.dev@angelina.local"`
- `password` (bcryptjs 12 rounds) = `"PacienteDev123!"`
- `rol` = `"PACIENTE"`
- `nombre` and `apellido` populated (any values — e.g. `"Paciente"` / `"Dev"`)
- `dni`, `telefono`, and `fechaNacimiento` populated with placeholder values

The script MUST write both users in a single DB transaction so a partial failure does not leave the dev environment with one user and no counterpart.

#### Scenario: First run creates both users with the documented credentials

- GIVEN a clean `angelina` database with no rows in `usuarios` matching `%.dev@angelina.local`
- WHEN `pnpm seed:dev` is executed
- THEN exactly one row MUST be inserted into `usuarios` with `email = 'doctor.dev@angelina.local'` AND `rol = 'DOCTOR'`
- AND exactly one row MUST be inserted into `usuarios` with `email = 'paciente.dev@angelina.local'` AND `rol = 'PACIENTE'`
- AND the doctor row MUST have a corresponding `doctores` profile row with `aceptaOnline = true`
- AND the paciente row MUST have a corresponding `pacientes` profile row with `dni`, `telefono`, `fechaNacimiento` populated
- AND `auth.hashPassword('DoctorDev123!')` MUST verify against the doctor's stored hash
- AND `auth.hashPassword('PacienteDev123!')` MUST verify against the paciente's stored hash

#### Scenario: Passwords use bcryptjs 12 rounds

- GIVEN the script inserts a new doctor user
- WHEN the `password_hash` column is read
- THEN the hash MUST start with `$2b$12$` (bcrypt with cost factor 12 — matching `src/infrastructure/auth/password.ts`)
- AND the same MUST hold for the paciente user

### REQ-DEV-SEED-2: Script is idempotent

Running `pnpm seed:dev` two or more times in succession MUST NOT create duplicate users, duplicate profiles, or duplicate passwords. The script MUST use `INSERT ... ON CONFLICT (email) DO NOTHING` for both `usuarios` rows. The script MUST check `SELECT id FROM usuarios WHERE email = $1` before each insert and reuse the existing `id` if present. Profile rows MUST be inserted with `ON CONFLICT (usuario_id) DO NOTHING` semantics — if a profile already exists, it MUST NOT be overwritten (the operator may have manually edited it).

The second-and-subsequent runs MUST exit successfully (exit code 0) and MUST produce the same observable output (same `citaId` printed to stdout — see REQ-DEV-SEED-4) as the first run.

#### Scenario: Re-running the script produces no duplicate users

- GIVEN the script has been executed once and the two `.dev@angelina.local` users exist
- WHEN `pnpm seed:dev` is executed a second time
- THEN `SELECT count(*) FROM usuarios WHERE email IN ('doctor.dev@angelina.local', 'paciente.dev@angelina.local')` MUST return exactly 2
- AND the `usuarios.id` values for both emails MUST be byte-identical to the values after the first run (no new rows, no replaced rows)
- AND the script MUST exit with code 0

#### Scenario: Re-running the script does not clobber manual profile edits

- GIVEN the doctor profile exists with `aceptaOnline = true` AND a manually-edited `precioConsulta` value
- WHEN `pnpm seed:dev` is executed again
- THEN the `precioConsulta` value MUST be preserved (not overwritten by the script's default)
- AND `aceptaOnline` MUST remain `true`

#### Scenario: Idempotency holds across three consecutive runs

- GIVEN `pnpm seed:dev` has not been run before
- WHEN it is executed three times in a row with no other DB writes between runs
- THEN `SELECT count(*) FROM usuarios WHERE email LIKE '%.dev@angelina.local'` MUST return exactly 2
- AND `SELECT count(*) FROM doctores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%.dev@angelina.local')` MUST return exactly 1
- AND `SELECT count(*) FROM pacientes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%.dev@angelina.local')` MUST return exactly 1

### REQ-DEV-SEED-3: Script creates exactly one cita

The script MUST create exactly one cita linking the seeded doctor and paciente, using the existing `createAppointment` use case (the script MUST NOT reimplement booking logic in raw SQL — it MUST call into the application layer so the same `FOR UPDATE`, modality gate, and audit log path is exercised). The cita MUST satisfy all of the following:

- `pacienteId` = the seeded paciente's `id`
- `medicoId` = the seeded doctor's `id`
- `fechaHora` = `new Date(Date.now() + 5 * 60 * 1000)` (5 minutes in the future at script run time)
- `modalidad` = `"ONLINE"`
- `estado` = `"CONFIRMADA"` (the script MUST set this explicitly — `createAppointment` defaults to `PENDIENTE`, and the seed needs the cita to be `CONFIRMADA` so the join window is open)
- `motivoConsulta` = a non-empty string (e.g. `"Consulta de prueba — seed dev"`)
- `livekit_room_name` = `"cita-dev-{shortId}"` where `{shortId}` is an 8-character lowercase hex substring of the cita's UUID

If a `CONFIRMADA` or `PROGRAMADA` cita already exists between the same doctor and paciente with the same `fechaHora` (within a ±1 minute tolerance), the script MUST reuse the existing cita and MUST NOT create a duplicate. If a `COMPLETADA` / `CANCELADA` / `NO_ASISTIO` cita already exists for the same pair, the script MUST create a new cita (the operator may be re-running the seed because the previous call ended).

#### Scenario: First run creates the cita with the documented shape

- GIVEN both users exist from REQ-DEV-SEED-1 and no cita links them
- WHEN `pnpm seed:dev` is executed
- THEN exactly one row MUST be inserted into `citas` with `medico_id` = doctor's id AND `paciente_id` = paciente's id
- AND `fechaHora` MUST be within ±10 seconds of `now() + 5 minutes` at script run time
- AND `modalidad` MUST be exactly `'ONLINE'`
- AND `estado` MUST be exactly `'CONFIRMADA'` (NOT `'PENDIENTE'`)
- AND `livekit_room_name` MUST match the regex `/^cita-dev-[0-9a-f]{8}$/`

#### Scenario: Re-run with a CONFIRMADA cita present does not duplicate

- GIVEN a cita exists linking the seeded doctor + paciente with `estado = 'CONFIRMADA'`
- WHEN `pnpm seed:dev` is executed
- THEN `SELECT count(*) FROM citas WHERE medico_id = $doctorId AND paciente_id = $pacienteId AND estado = 'CONFIRMADA'` MUST remain exactly 1
- AND the existing `citaId` MUST be the value printed to stdout (not a new one)

#### Scenario: Re-run after the previous cita was COMPLETADA creates a new one

- GIVEN a cita exists linking the seeded doctor + paciente with `estado = 'COMPLETADA'`
- WHEN `pnpm seed:dev` is executed
- THEN a NEW cita MUST be created with `estado = 'CONFIRMADA'` and `fechaHora = now() + 5 minutes`
- AND the script MUST print the NEW cita id to stdout

### REQ-DEV-SEED-4: Script outputs the cita URL on stdout

After the script completes successfully, it MUST print to stdout a human-readable block containing the credentials for both seeded users AND the cita URL. The cita URL MUST have the exact shape `http://localhost:3000/citas/{citaId}/llamada` (where `{citaId}` is the UUID of the cita from REQ-DEV-SEED-3) so the operator can copy-paste it directly into a browser tab. The output MUST include:

- A header line identifying the block as dev seed output (e.g. `=== angelina-consultoria dev seed ===`)
- `Doctor:` followed by `doctor.dev@angelina.local` and `DoctorDev123!`
- `Paciente:` followed by `paciente.dev@angelina.local` and `PacienteDev123!`
- `Cita URL:` followed by the full URL
- A trailing newline

The output MUST be plain text (no ANSI color codes, no JSON) so it is pasteable into terminal logs and chat messages.

#### Scenario: Stdout contains the cita URL

- GIVEN the script creates or reuses a cita and exits successfully
- WHEN stdout is captured
- THEN a line matching the regex `/Cita URL:\s+http:\/\/localhost:3000\/citas\/[0-9a-f-]{36}\/llamada/` MUST be present
- AND the `citaId` in the URL MUST be a valid UUID v4
- AND the URL MUST use the dev Next.js port (3000) and the dev hostname (localhost)

#### Scenario: Output is human-readable, not JSON

- GIVEN the script exits successfully
- WHEN stdout is inspected
- THEN the first character MUST be a non-`{` character (i.e. NOT a JSON object)
- AND the output MUST contain the literal strings `Doctor:` and `Paciente:` and `Cita URL:`
- AND no ANSI escape sequences (`\u001b[`) MUST be present in the output

### REQ-DEV-SEED-5: Script exits 0 on success, non-zero on DB error

The script MUST exit with code `0` on a successful run (users + cita seeded or already present). On any database error (connection refused, constraint violation, transaction rollback), the script MUST exit with a non-zero code AND print a clear, single-line error message to stderr in the shape `seed:dev: <error summary>` followed by the underlying error message. The error message MUST identify which step failed (user insert, profile insert, cita create) so the operator can debug without `console.log` archaeology.

The script MUST NOT catch and swallow errors silently — every error path MUST propagate to the process exit code so the operator's shell (`$?`) and CI pipelines can detect failure.

#### Scenario: Successful run exits 0

- GIVEN the dev DB is reachable and the seeded users do not exist
- WHEN `pnpm seed:dev` is executed
- THEN the process MUST exit with code 0
- AND `$?` in the calling shell MUST be `0`

#### Scenario: DB unreachable exits non-zero with a clear message

- GIVEN the dev Postgres container is not running (e.g. `docker compose down`)
- WHEN `pnpm seed:dev` is executed
- THEN the process MUST exit with a non-zero code
- AND stderr MUST contain a line starting with `seed:dev:`
- AND the error message MUST identify the connection failure (e.g. `seed:dev: DB connection failed — ECONNREFUSED 127.0.0.1:5432`)
- AND no cita URL MUST be printed to stdout (the script did not reach the success path)

#### Scenario: Constraint violation exits non-zero and identifies the step

- GIVEN the `usuarios` table has a unique constraint that the script's insert violates (simulated by running against a stale DB with a conflicting row)
- WHEN `pnpm seed:dev` is executed
- THEN the process MUST exit with a non-zero code
- AND the stderr message MUST mention which step failed (e.g. `seed:dev: failed at usuario insert for doctor.dev@angelina.local: <db error>`)
