import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "@/infrastructure/db/schema";
import { UserRole } from "@/domain/enums";

// ── Types ───────────────────────────────────────────────────────────────

export interface SeededDoctor {
  usuario: typeof schema.usuarios.$inferSelect;
  doctor: typeof schema.doctores.$inferSelect;
}

export interface SeededPatient {
  usuario: typeof schema.usuarios.$inferSelect;
  paciente: typeof schema.pacientes.$inferSelect;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const TEST_PASSWORD_HASH = bcrypt.hashSync("test-password", 10);
const TEST_EMAIL_COUNTER = { value: 0 };

function nextEmail(prefix: string): string {
  TEST_EMAIL_COUNTER.value += 1;
  return `${prefix}.${TEST_EMAIL_COUNTER.value}@test.angelina-consultoria.local`;
}

// ── Seed functions ──────────────────────────────────────────────────────

/**
 * Creates a DOCTOR user + doctor profile record.
 * Returns both the usuario and doctor rows.
 */
export async function seedDoctor(
  db: PostgresJsDatabase<typeof schema>,
  overrides?: Partial<typeof schema.usuarios.$inferInsert>,
): Promise<SeededDoctor> {
  const [usuario] = await db
    .insert(schema.usuarios)
    .values({
      email: nextEmail("doctor"),
      passwordHash: TEST_PASSWORD_HASH,
      nombre: "Doctor Test",
      rol: UserRole.DOCTOR,
      telefono: "600000001",
      activo: true,
      ...overrides,
    })
    .returning();

  if (!usuario) throw new Error("Failed to seed doctor user");

  const [doctor] = await db
    .insert(schema.doctores)
    .values({
      usuarioId: usuario.id,
      numeroColegiado: `COL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      especialidad: "Medicina General",
      precioConsulta: "50.00",
      verificado: true,
    })
    .returning();

  if (!doctor) throw new Error("Failed to seed doctor profile");

  return { usuario, doctor };
}

/**
 * Creates a PACIENTE user + paciente profile record.
 * Returns both the usuario and paciente rows.
 */
export async function seedPatient(
  db: PostgresJsDatabase<typeof schema>,
  overrides?: Partial<typeof schema.usuarios.$inferInsert>,
): Promise<SeededPatient> {
  const [usuario] = await db
    .insert(schema.usuarios)
    .values({
      email: nextEmail("paciente"),
      passwordHash: TEST_PASSWORD_HASH,
      nombre: "Paciente Test",
      rol: UserRole.PACIENTE,
      telefono: "600000002",
      activo: true,
      ...overrides,
    })
    .returning();

  if (!usuario) throw new Error("Failed to seed patient user");

  const [paciente] = await db
    .insert(schema.pacientes)
    .values({
      usuarioId: usuario.id,
    })
    .returning();

  if (!paciente) throw new Error("Failed to seed patient profile");

  return { usuario, paciente };
}

/**
 * Sets the weekly availability schedule for a doctor.
 *
 * @param disponibilidad - Record of day name → time range array.
 *   Example: `{ lunes: [{ inicio: "09:00", fin: "12:00" }] }`
 */
export async function seedAvailability(
  db: PostgresJsDatabase<typeof schema>,
  doctorId: string,
  disponibilidad: Record<
    string,
    Array<{ inicio: string; fin: string }>
  >,
): Promise<void> {
  // Remove any existing availability for this doctor first
  await db
    .delete(schema.doctorDisponibilidad)
    .where(eq(schema.doctorDisponibilidad.doctorId, doctorId));

  // Insert the new availability
  await db.insert(schema.doctorDisponibilidad).values({
    doctorId,
    disponibilidad: disponibilidad as Record<string, unknown>,
  });
}
