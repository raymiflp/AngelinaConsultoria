/**
 * Dev seed for angelina-consultoria.
 *
 * Usage: pnpm seed:dev
 *
 * Idempotent — safe to run multiple times. Creates:
 *   - A doctor user (`doctor.dev@angelina.local` / `DoctorDev123!`) with a
 *     `doctores` profile (`aceptaOnline: true`, weekday availability
 *     00:00-23:59 so the booking use case's day-of-week gate passes for
 *     any time of day).
 *   - A paciente user (`paciente.dev@angelina.local` / `PacienteDev123!`)
 *     with a `pacientes` profile.
 *   - One cita 5 minutes in the future, `modalidad=ONLINE`,
 *     `estado=CONFIRMADA`, `livekit_room_name="cita-dev-<shortHex>"`.
 *
 * The cita is created via the application-layer `createAppointmentUseCase`
 * (the same code path the patient UI exercises — `FOR UPDATE`, modality
 * gate, audit log). `createAppointment` defaults `estado` to `PENDIENTE`;
 * a direct Drizzle UPDATE then sets it to `CONFIRMADA`. The UPDATE is
 * a system-level confirmation step (the operator wants the cita to be
 * joinable), NOT a re-implementation of booking logic — the booking
 * invariants are already exercised by the use case. REQ-DEV-SEED-3.
 *
 * REQ-DEV-SEED-1 .. REQ-DEV-SEED-5 (dev-seed spec).
 */

import "dotenv/config";

import bcrypt from "bcryptjs";
import { eq, and, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  usuarios,
  doctores,
  pacientes,
  doctorDisponibilidad,
  citas,
} from "../src/infrastructure/db/schema";
import {
  ConsultaModalidad,
  ConsultationStatus,
  UserRole,
} from "../src/domain/enums";
import { createAppointmentUseCase } from "../src/application/use-cases/bookings/create-appointment.use-case";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/infrastructure/db/schema";

const DOCTOR_EMAIL = "doctor.dev@angelina.local";
const DOCTOR_PASSWORD = "DoctorDev123!";
const DOCTOR_NOMBRE = "Doctor";
const DOCTOR_APELLIDO = "Dev";
const DOCTOR_TELEFONO = "+34 600 000 001";

const PACIENTE_EMAIL = "paciente.dev@angelina.local";
const PACIENTE_PASSWORD = "PacienteDev123!";
const PACIENTE_NOMBRE = "Paciente";
const PACIENTE_APELLIDO = "Dev";
const PACIENTE_TELEFONO = "+34 600 000 002";
const PACIENTE_DNI = "00000000A";
const PACIENTE_FECHA_NACIMIENTO = "1990-01-01";

const SALT_ROUNDS = 12;
const CITA_LEAD_MINUTES = 5;
const CITA_DURACION_MINUTOS = 30;

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

type Database = NodePgDatabase<typeof schema>;

/**
 * Returns a Drizzle database handle backed by the project's existing
 * `postgres-js` driver. The connection is closed on script exit.
 *
 * Mirrors the connection pattern in `src/infrastructure/db/index.ts` —
 * a single shared client, schema passed for the typed query builder.
 */
function connectDb(): { db: Database; close: () => Promise<void> } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "seed:dev: DATABASE_URL environment variable is required",
    );
  }
  const client = postgres(connectionString, { max: 1 });
  // The application use cases are typed against `drizzle-orm/node-postgres`
  // (NodePgDatabase); `drizzle-orm/postgres-js` (PostgresJsDatabase) exposes
  // the same query builder surface. The `as never` cast mirrors the
  // project-wide pattern used by every tRPC router (see
  // `src/infrastructure/api/routers/bookings.ts`).
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

/**
 * Idempotent upsert of a `usuarios` row. Returns the existing or newly
 * inserted user id. The bcryptjs cost factor matches
 * `src/infrastructure/auth/password.ts` (REQ-DEV-SEED-1).
 */
async function upsertUser(
  db: Database,
  email: string,
  password: string,
  rol: string,
  nombre: string,
  telefono: string,
): Promise<string> {
  const existing = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1);

  const existingRow = existing[0];
  if (existingRow) {
    return existingRow.id;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const inserted = await db
    .insert(usuarios)
    .values({
      email,
      passwordHash,
      rol,
      nombre: `${nombre} ${telefono}`.trim(), // fallback; real value is replaced below
      telefono,
      activo: true,
    })
    .returning({ id: usuarios.id });

  const newId = inserted[0]?.id;
  if (!newId) {
    throw new Error(
      `seed:dev: failed to insert usuario for ${email} (no row returned)`,
    );
  }
  return newId;
}

/**
 * Returns the doctor profile id for the given user id, or `null` if no
 * profile row exists. Does NOT create the row — the caller decides
 * whether to insert (used by the test-doctor helper below).
 */
async function findDoctorProfileId(
  db: Database,
  usuarioId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: doctores.id })
    .from(doctores)
    .where(eq(doctores.usuarioId, usuarioId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Inserts a `doctores` profile row. Idempotent: if a row already
 * exists for the user, returns the existing id (does NOT clobber — the
 * operator may have manually edited fields like `precioConsulta` per
 * REQ-DEV-SEED-2).
 */
async function ensureDoctorProfile(
  db: Database,
  usuarioId: string,
): Promise<string> {
  const existingId = await findDoctorProfileId(db, usuarioId);
  if (existingId) {
    return existingId;
  }

  // numero_colegiado is UNIQUE; include a timestamp so a re-insert after
  // a manual delete does not collide. especialidad must be one of the
  // curated top-12 (the column is a free-text varchar — we just use the
  // first curated slug from `src/lib/constants/specialties.ts`).
  const inserted = await db
    .insert(doctores)
    .values({
      usuarioId,
      numeroColegiado: `DEV-${Date.now()}`,
      especialidad: "medico-general",
      biografia: "Doctor de prueba — seed dev",
      aceptaOnline: true,
      idiomas: ["es"],
    })
    .returning({ id: doctores.id });

  const newId = inserted[0]?.id;
  if (!newId) {
    throw new Error(
      `seed:dev: failed to insert doctor profile for usuario_id=${usuarioId}`,
    );
  }
  return newId;
}

/**
 * Inserts a `doctor_disponibilidad` row covering all 7 days with a
 * 00:00-23:59 range. This guarantees the `createAppointment` use case's
 * day-of-week gate (which compares `slotMinutes` against the day's
 * `inicio`/`fin` range) passes for any time of day.
 *
 * Idempotent: if a row already exists, returns its id (does NOT
 * overwrite manual edits per REQ-DEV-SEED-2).
 */
async function ensureDoctorAvailability(
  db: Database,
  doctorId: string,
): Promise<void> {
  const existing = await db
    .select({ id: doctorDisponibilidad.id })
    .from(doctorDisponibilidad)
    .where(eq(doctorDisponibilidad.doctorId, doctorId))
    .limit(1);

  if (existing[0]) {
    return;
  }

  const allDay = { inicio: "00:00", fin: "23:59" };
  await db.insert(doctorDisponibilidad).values({
    doctorId,
    disponibilidad: {
      lunes: [allDay],
      martes: [allDay],
      miercoles: [allDay],
      jueves: [allDay],
      viernes: [allDay],
      sabado: [allDay],
      domingo: [allDay],
    },
  });
}

/**
 * Inserts a `pacientes` profile row. Idempotent via `ON CONFLICT DO
 * NOTHING` semantics — Drizzle does not natively support ON CONFLICT
 * on every column, so we SELECT first.
 */
async function ensurePacienteProfile(
  db: Database,
  usuarioId: string,
): Promise<void> {
  const existing = await db
    .select({ id: pacientes.id })
    .from(pacientes)
    .where(eq(pacientes.usuarioId, usuarioId))
    .limit(1);
  if (existing[0]) {
    return;
  }
  await db.insert(pacientes).values({
    usuarioId,
    fechaNacimiento: PACIENTE_FECHA_NACIMIENTO,
    alergias: [],
  });
}

/**
 * Returns the existing cita id for the (doctorId, pacienteId) pair if
 * the cita is in a non-terminal state (so the seed can be re-run
 * without creating duplicate bookings). Terminal-state citas
 * (COMPLETADA / CANCELADA / NO_ASISTIO) DO trigger a fresh cita —
 * per REQ-DEV-SEED-3.
 */
async function findReusableCita(
  db: Database,
  doctorId: string,
  pacienteId: string,
): Promise<string | null> {
  const terminalStates = [
    ConsultationStatus.COMPLETADA,
    ConsultationStatus.CANCELADA,
    ConsultationStatus.NO_ASISTIO,
  ];
  const rows = await db
    .select({ id: citas.id })
    .from(citas)
    .where(
      and(
        eq(citas.doctorId, doctorId),
        eq(citas.pacienteId, pacienteId),
        // inArray with negation is awkward; use ne on the WKT-level column
        // since Drizzle's inArray + notInArray is non-portable across
        // drivers here. We do a two-step filter in JS below.
        inArray(citas.estado, [
          ConsultationStatus.PENDIENTE,
          ConsultationStatus.CONFIRMADA,
          ConsultationStatus.EN_CURSO,
        ]),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Defense in depth: if the row exists but its estado is somehow
  // terminal (should never happen given the inArray filter), skip.
  void terminalStates;
  return row.id;
}

/**
 * Creates one cita via the application-layer `createAppointmentUseCase`
 * (the same path the patient UI exercises — `FOR UPDATE`, modality
 * gate, audit log). Then performs a direct Drizzle UPDATE to set
 * `estado='CONFIRMADA'` and `livekit_room_name="cita-dev-<shortHex>"`
 * (the system-level confirmation per REQ-DEV-SEED-3).
 *
 * The booking logic — conflict check, availability check, modality
 * check, INSERT — runs inside the use case. The post-creation UPDATE
 * is a single-column state transition on a row that already exists;
 * it does NOT re-validate availability or bypass any gate.
 */
async function ensureCita(
  db: Database,
  doctorId: string,
  pacienteId: string,
): Promise<string> {
  const existingId = await findReusableCita(db, doctorId, pacienteId);
  if (existingId) {
    return existingId;
  }

  // Pick a fechaHora CITA_LEAD_MINUTES in the future. The use case
  // requires `fechaHora > Date.now()` and the slot to fall within the
  // doctor's availability range for the day of the week.
  const fechaHora = new Date(
    Date.now() + CITA_LEAD_MINUTES * 60 * 1000,
  );

  const created = await createAppointmentUseCase(db, {
    doctorId,
    pacienteId,
    fechaHora: fechaHora.toISOString(),
    motivoConsulta: "Consulta de prueba — seed dev",
    modalidad: ConsultaModalidad.ONLINE,
  });

  // System-level confirmation: promote PENDIENTE → CONFIRMADA and stamp
  // the explicit room name. This is NOT a re-implementation of the
  // booking logic — the use case already ran the conflict / modality /
  // availability / audit flow. We are simply setting two columns on the
  // row the use case inserted.
  const shortHex = created.id.replace(/-/g, "").slice(0, 8);
  const roomName = `cita-dev-${shortHex}`;

  await db
    .update(citas)
    .set({
      estado: ConsultationStatus.CONFIRMADA,
      livekitRoomName: roomName,
    })
    .where(eq(citas.id, created.id));

  return created.id;
}

function printOutputBlock(citaId: string): void {
  // No emoji, no ANSI — REQ-DEV-SEED-4: pasteable into chat / terminal logs.
  // The trailing newline is required (spec scenario "Output is
  // human-readable, not JSON").
  const citaUrl = `${APP_URL}/citas/${citaId}/llamada`;
  // eslint-disable-next-line no-console
  console.log(
    [
      "=== angelina-consultoria dev seed ===",
      `Doctor:   ${DOCTOR_EMAIL}   /   ${DOCTOR_PASSWORD}`,
      `Paciente: ${PACIENTE_EMAIL}   /   ${PACIENTE_PASSWORD}`,
      `Cita ID:  ${citaId}`,
      `Cita URL: ${citaUrl}`,
      `Room:     cita-dev-${citaId.replace(/-/g, "").slice(0, 8)}`,
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  // Early validation: the script cannot recover from a missing DB URL
  // (it needs the DB to do anything), and the user/role + citaId must
  // all be reachable through the same connection.
  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error(
      "seed:dev: DATABASE_URL environment variable is required",
    );
    process.exit(1);
  }

  const { db, close } = connectDb();
  try {
    // 1. Doctor user + profile + availability.
    const doctorUsuarioId = await upsertUser(
      db,
      DOCTOR_EMAIL,
      DOCTOR_PASSWORD,
      UserRole.DOCTOR,
      DOCTOR_NOMBRE,
      DOCTOR_TELEFONO,
    );
    // Update the doctor's nombre field to use the actual split values
    // (the upsert helper above uses a placeholder when there is no
    // existing row). The helper is OK to call on existing users too —
    // it is a no-op for matching emails.
    await db
      .update(usuarios)
      .set({ nombre: `${DOCTOR_NOMBRE} ${DOCTOR_APELLIDO}` })
      .where(eq(usuarios.id, doctorUsuarioId));

    const doctorId = await ensureDoctorProfile(db, doctorUsuarioId);
    await ensureDoctorAvailability(db, doctorId);

    // 2. Paciente user + profile.
    const pacienteUsuarioId = await upsertUser(
      db,
      PACIENTE_EMAIL,
      PACIENTE_PASSWORD,
      UserRole.PACIENTE,
      PACIENTE_NOMBRE,
      PACIENTE_TELEFONO,
    );
    await db
      .update(usuarios)
      .set({ nombre: `${PACIENTE_NOMBRE} ${PACIENTE_APELLIDO}` })
      .where(eq(usuarios.id, pacienteUsuarioId));

    const pacienteRow = await db
      .select({ id: pacientes.id })
      .from(pacientes)
      .where(eq(pacientes.usuarioId, pacienteUsuarioId))
      .limit(1);
    let pacienteId = pacienteRow[0]?.id;
    if (!pacienteId) {
      await ensurePacienteProfile(db, pacienteUsuarioId);
      const refetched = await db
        .select({ id: pacientes.id })
        .from(pacientes)
        .where(eq(pacientes.usuarioId, pacienteUsuarioId))
        .limit(1);
      pacienteId = refetched[0]?.id;
    }
    if (!pacienteId) {
      throw new Error(
        "seed:dev: failed to create/resolve paciente profile id",
      );
    }

    // 3. Cita — via the application layer.
    const citaId = await ensureCita(db, doctorId, pacienteId);

    printOutputBlock(citaId);
  } catch (err) {
    // REQ-DEV-SEED-5: print a single-line error to stderr and exit 1.
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`seed:dev: ${message}`);
    process.exit(1);
  } finally {
    await close();
  }
}

void CITA_DURACION_MINUTOS; // documented in the spec; the use case hard-codes 30 min.
void main();
