import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@/infrastructure/db/schema";
import {
  createAppointmentUseCase,
  updateAppointmentStatusUseCase,
  getDoctorSlotsUseCase,
  writeAuditLogUseCase,
} from "@/application";
import { ConsultationStatus, ConsultaModalidad } from "@/domain/enums";
import { getDb, resetDb, closeDb } from "./helpers/db";
import { seedDoctor, seedPatient, seedAvailability } from "./helpers/seed";
import type { SeededDoctor, SeededPatient } from "./helpers/seed";
import type { Slot } from "@/infrastructure/booking/slot-utils";

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const HAS_DB_URL = !!(
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
);

/**
 * Spanish day-name → JS getDay() index.
 * Mirrors the mapping in src/infrastructure/booking/slot-utils.ts.
 */
const DAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

/**
 * Returns a Date for the next occurrence of a Spanish day name
 * that is at least 7 days in the future (ensuring all "future date"
 * validations in the use cases pass).
 */
function getNextDayDate(dayName: string): Date {
  const targetDay = DAY_INDEX[dayName] ?? 1;
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  // Add another full week to guarantee the date is comfortably in the future
  daysUntil += 7;

  const result = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntil,
  );
  return result;
}

/**
 * Formats a Date to "YYYY-MM-DD".
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats a Date at a given hour+minute to an ISO-ish string,
 * using the LOCAL date components so the day-of-week is preserved.
 */
function formatAppointmentDate(
  date: Date,
  hour: number,
  minute: number,
): string {
  return `${formatDate(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_DB_URL)("Booking flow — integration", () => {
  let pgDb: ReturnType<typeof getDb>;
  let db: NodePgDatabase<typeof schema>;
  let doctor: SeededDoctor;
  let patient: SeededPatient;
  let mondayDate: Date;

  beforeAll(async () => {
    pgDb = getDb();
    db = pgDb as unknown as NodePgDatabase<typeof schema>;
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await resetDb();
    doctor = await seedDoctor(pgDb);
    patient = await seedPatient(pgDb);
    mondayDate = getNextDayDate("lunes");
  });

  // ── Test 1: Full create → confirm → complete ──────────────────────

  it("should create, confirm, and complete an appointment with audit trail", async () => {
    // Arrange: set availability for Monday 09:00-12:00
    await seedAvailability(pgDb, doctor.doctor.id, {
      lunes: [{ inicio: "09:00", fin: "12:00" }],
    });

    // Act 1: create appointment at Monday 10:00
    const fechaHora = formatAppointmentDate(mondayDate, 10, 0);
    const created = await createAppointmentUseCase(db, {
      doctorId: doctor.doctor.id,
      pacienteId: patient.paciente.id,
      fechaHora,
      motivoConsulta: "Revisión general",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });

    // Assert 1: status is PENDIENTE
    expect(created).toBeDefined();
    expect(created.estado).toBe(ConsultationStatus.PENDIENTE);
    expect(created.motivo).toBe("Revisión general");
    expect(created.doctorId).toBe(doctor.doctor.id);
    expect(created.pacienteId).toBe(patient.paciente.id);

    // Audit log for creation
    await writeAuditLogUseCase(db, {
      usuarioId: patient.usuario.id,
      accion: "CITA_CREATED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: { doctorId: doctor.doctor.id, fechaHora },
    });

    // Verify audit log entry
    const createLogs = await pgDb
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entidadId, created.id),
          eq(schema.auditLogs.accion, "CITA_CREATED"),
        ),
      );
    expect(createLogs).toHaveLength(1);
    expect(createLogs[0]!.usuarioId).toBe(patient.usuario.id);

    // Act 2: confirm → CONFIRMADA
    const confirmed = await updateAppointmentStatusUseCase(db, {
      citaId: created.id,
      doctorId: doctor.doctor.id,
      nuevoEstado: ConsultationStatus.CONFIRMADA,
    });

    // Assert 2
    expect(confirmed.estado).toBe(ConsultationStatus.CONFIRMADA);

    // Audit log for status change
    await writeAuditLogUseCase(db, {
      usuarioId: doctor.usuario.id,
      accion: "CITA_STATUS_CHANGED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: {
        estadoAnterior: ConsultationStatus.PENDIENTE,
        estadoNuevo: ConsultationStatus.CONFIRMADA,
      },
    });

    // Act 3: mark as EN_CURSO (required by state machine before COMPLETADA)
    const inProgress = await updateAppointmentStatusUseCase(db, {
      citaId: created.id,
      doctorId: doctor.doctor.id,
      nuevoEstado: ConsultationStatus.EN_CURSO,
    });
    expect(inProgress.estado).toBe(ConsultationStatus.EN_CURSO);

    await writeAuditLogUseCase(db, {
      usuarioId: doctor.usuario.id,
      accion: "CITA_STATUS_CHANGED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: {
        estadoAnterior: ConsultationStatus.CONFIRMADA,
        estadoNuevo: ConsultationStatus.EN_CURSO,
      },
    });

    // Act 4: complete → COMPLETADA
    const completed = await updateAppointmentStatusUseCase(db, {
      citaId: created.id,
      doctorId: doctor.doctor.id,
      nuevoEstado: ConsultationStatus.COMPLETADA,
    });

    // Assert 4
    expect(completed.estado).toBe(ConsultationStatus.COMPLETADA);

    await writeAuditLogUseCase(db, {
      usuarioId: doctor.usuario.id,
      accion: "CITA_STATUS_CHANGED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: {
        estadoAnterior: ConsultationStatus.EN_CURSO,
        estadoNuevo: ConsultationStatus.COMPLETADA,
      },
    });

    // Final audit trail verification: 4 log entries (created + 3 status changes)
    const allLogs = await pgDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entidadId, created.id))
      .orderBy(schema.auditLogs.createdAt);
    expect(allLogs).toHaveLength(4);

    // Verify the DB row matches
    const [saved] = await pgDb
      .select()
      .from(schema.citas)
      .where(eq(schema.citas.id, created.id));
    expect(saved).toBeDefined();
    expect(saved!.estado).toBe(ConsultationStatus.COMPLETADA);
  });

  // ── Test 2: Cancel flow with audit trail ───────────────────────────

  it("should cancel an appointment and create an audit log entry", async () => {
    // Arrange
    await seedAvailability(pgDb, doctor.doctor.id, {
      lunes: [{ inicio: "09:00", fin: "12:00" }],
    });

    const fechaHora = formatAppointmentDate(mondayDate, 10, 0);
    const created = await createAppointmentUseCase(db, {
      doctorId: doctor.doctor.id,
      pacienteId: patient.paciente.id,
      fechaHora,
      motivoConsulta: "Consulta de control",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });

    // Write creation audit log (as the router would)
    await writeAuditLogUseCase(db, {
      usuarioId: patient.usuario.id,
      accion: "CITA_CREATED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: { doctorId: doctor.doctor.id, fechaHora },
    });

    // Act: cancel the appointment
    const cancelled = await updateAppointmentStatusUseCase(db, {
      citaId: created.id,
      doctorId: doctor.doctor.id,
      nuevoEstado: ConsultationStatus.CANCELADA,
    });

    // Assert: status changed
    expect(cancelled.estado).toBe(ConsultationStatus.CANCELADA);

    // Write cancellation audit log
    await writeAuditLogUseCase(db, {
      usuarioId: doctor.usuario.id,
      accion: "CITA_STATUS_CHANGED",
      entidadAfectada: "cita",
      entidadId: created.id,
      detalles: {
        estadoAnterior: ConsultationStatus.PENDIENTE,
        estadoNuevo: ConsultationStatus.CANCELADA,
      },
    });

    // Verify audit logs
    const cancelLogs = await pgDb
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entidadId, created.id),
          eq(schema.auditLogs.accion, "CITA_STATUS_CHANGED"),
        ),
      );
    expect(cancelLogs).toHaveLength(1);
    expect(cancelLogs[0]!.detalles).toEqual({
      estadoAnterior: ConsultationStatus.PENDIENTE,
      estadoNuevo: ConsultationStatus.CANCELADA,
    });

    // Verify the DB row
    const [saved] = await pgDb
      .select()
      .from(schema.citas)
      .where(eq(schema.citas.id, created.id));
    expect(saved!.estado).toBe(ConsultationStatus.CANCELADA);
  });

  // ── Test 3: Conflict detection (double booking) ────────────────────

  it("should reject double booking with a CONFLICT error", async () => {
    // Arrange
    await seedAvailability(pgDb, doctor.doctor.id, {
      lunes: [{ inicio: "09:00", fin: "12:00" }],
    });

    const fechaHora = formatAppointmentDate(mondayDate, 10, 0);

    // First booking — should succeed
    const first = await createAppointmentUseCase(db, {
      doctorId: doctor.doctor.id,
      pacienteId: patient.paciente.id,
      fechaHora,
      motivoConsulta: "Primera cita",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });
    expect(first).toBeDefined();

    // Act: try to book the same slot
    const secondPromise = createAppointmentUseCase(db, {
      doctorId: doctor.doctor.id,
      pacienteId: patient.paciente.id,
      fechaHora,
      motivoConsulta: "Segunda cita — debería fallar",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });

    // Assert: throws CONFLICT
    await expect(secondPromise).rejects.toThrow(TRPCError);
    await expect(secondPromise).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // Verify only one appointment exists for that slot
    const [saved] = await pgDb
      .select()
      .from(schema.citas)
      .where(
        and(
          eq(schema.citas.doctorId, doctor.doctor.id),
          eq(schema.citas.fechaHora, new Date(fechaHora)),
        ),
      );
    expect(saved).toBeDefined();
    expect(saved!.id).toBe(first.id);
  });

  // ── Test 4: Get slots respects booked slots ────────────────────────

  it("should mark booked slots as unavailable in getDoctorSlots", async () => {
    // Arrange: availability Monday 09:00-11:00
    await seedAvailability(pgDb, doctor.doctor.id, {
      lunes: [{ inicio: "09:00", fin: "11:00" }],
    });

    // Book the 09:00 slot
    const fechaHora = formatAppointmentDate(mondayDate, 9, 0);
    await createAppointmentUseCase(db, {
      doctorId: doctor.doctor.id,
      pacienteId: patient.paciente.id,
      fechaHora,
      motivoConsulta: "Cita temprana",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });

    // Act: get slots for that day
    const dateStr = formatDate(mondayDate);
    const slots = await getDoctorSlotsUseCase(db, {
      doctorId: doctor.doctor.id,
      date: dateStr,
    });

    // Assert: "09:00" slot is unavailable, "09:30" is available
    // Slots are returned as ISO strings; parse the start time
    const slot09 = slots.find((s: Slot) => {
      const start = new Date(s.start);
      return start.getHours() === 9 && start.getMinutes() === 0;
    });
    const slot0930 = slots.find((s: Slot) => {
      const start = new Date(s.start);
      return start.getHours() === 9 && start.getMinutes() === 30;
    });
    const slot10 = slots.find((s: Slot) => {
      const start = new Date(s.start);
      return start.getHours() === 10 && start.getMinutes() === 0;
    });

    expect(slot09).toBeDefined();
    expect(slot09!.available).toBe(false);

    expect(slot0930).toBeDefined();
    expect(slot0930!.available).toBe(true);

    expect(slot10).toBeDefined();
    expect(slot10!.available).toBe(true);

    // Verify total slot count: 09:00-11:00 → 4 slots (09:00, 09:30, 10:00, 10:30)
    expect(slots).toHaveLength(4);
  });

  // ── Test 5: Doctor availability by day name ─────────────────────────

  it("should generate slots according to the doctor's weekly schedule", async () => {
    // Arrange: availability for "lunes" (Monday) 09:00-12:00
    await seedAvailability(pgDb, doctor.doctor.id, {
      lunes: [{ inicio: "09:00", fin: "12:00" }],
    });

    // Act: get slots for next Monday
    const dateStr = formatDate(mondayDate);
    const slots = await getDoctorSlotsUseCase(db, {
      doctorId: doctor.doctor.id,
      date: dateStr,
    });

    // Assert: 6 slots generated (09:00, 09:30, 10:00, 10:30, 11:00, 11:30)
    expect(slots).toHaveLength(6);

    // All slots should be available (nothing booked yet)
    for (const slot of slots) {
      expect(slot.available).toBe(true);
    }

    // Verify the first and last slot times
    const firstStart = new Date(slots[0]!.start);
    const lastStart = new Date(slots[slots.length - 1]!.start);

    expect(firstStart.getHours()).toBe(9);
    expect(firstStart.getMinutes()).toBe(0);

    expect(lastStart.getHours()).toBe(11);
    expect(lastStart.getMinutes()).toBe(30);

    // Verify 30-min spacing between consecutive slots
    for (let i = 1; i < slots.length; i++) {
      const prevEnd = new Date(slots[i - 1]!.end);
      const currStart = new Date(slots[i]!.start);
      expect(currStart.getTime() - prevEnd.getTime()).toBe(0); // back-to-back
    }
  });
});
