import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, ne } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";
import { getDayName, formatHHMM } from "@/infrastructure/booking/slot-utils";
import { captureEvent } from "@/infrastructure/analytics";
import { EVENTS } from "@/infrastructure/analytics/events";

export interface CreateAppointmentInput {
  doctorId: string;
  pacienteId: string;
  fechaHora: string;
  motivoConsulta: string;
  modalidad: ConsultaModalidad;
}

export interface CreateAppointmentOutput {
  id: string;
  doctorId: string;
  pacienteId: string;
  fechaHora: Date;
  estado: string;
  motivo: string;
  duracionMinutos: number;
  modalidad: ConsultaModalidad;
}

/**
 * Creates a new appointment with race-condition protection
 * via SELECT FOR UPDATE within a Drizzle transaction.
 *
 * Validates:
 * - fechaHora is in the future
 * - No conflicting cita exists for the same doctor + time
 * - The slot is within the doctor's declared availability
 * - If modalidad === ONLINE, the doctor has opted in (acepta_online === true)
 *   — re-read INSIDE the transaction to close the TOCTOU window when a
 *   doctor toggles off mid-booking (D5 / AD-13 / R3).
 */
export async function createAppointmentUseCase(
  db: NodePgDatabase<typeof schema>,
  input: CreateAppointmentInput,
): Promise<CreateAppointmentOutput> {
  const { doctorId, pacienteId, fechaHora: fechaHoraStr, motivoConsulta, modalidad } = input;

  const fechaHora = new Date(fechaHoraStr);
  if (fechaHora.getTime() <= Date.now()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La fecha y hora debe ser en el futuro",
    });
  }

  const cita = await db.transaction(async (tx) => {
    // Lock-check for conflicting citas at the same time
    const conflicting = await tx
      .select({ id: schema.citas.id })
      .from(schema.citas)
      .where(
        and(
          eq(schema.citas.doctorId, doctorId),
          eq(schema.citas.fechaHora, fechaHora),
          ne(schema.citas.estado, ConsultationStatus.CANCELADA),
          ne(schema.citas.estado, ConsultationStatus.NO_ASISTIO),
        ),
      )
      .for("update");

    if (conflicting.length > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "El horario seleccionado ya está reservado",
      });
    }

    // Verify the slot is within the doctor's availability
    const availability = await tx
      .select()
      .from(schema.doctorDisponibilidad)
      .where(eq(schema.doctorDisponibilidad.doctorId, doctorId))
      .then((rows) => rows[0] ?? null);

    if (!availability) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El doctor no tiene disponibilidad configurada",
      });
    }

    const disponibilidad = availability.disponibilidad as Record<
      string,
      Array<{ inicio: string; fin: string }>
    >;
    const dayName = getDayName(fechaHora);
    const dayRanges = disponibilidad[dayName];

    if (!dayRanges || dayRanges.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El doctor no tiene disponibilidad para esta fecha",
      });
    }

    const slotMinutes = fechaHora.getHours() * 60 + fechaHora.getMinutes();
    const isInRange = dayRanges.some((r) => {
      const [rSH, rSM] = r.inicio.split(":").map(Number);
      const [rEH, rEM] = r.fin.split(":").map(Number);
      const rangeStart = rSH! * 60 + rSM!;
      const rangeEnd = rEH! * 60 + rEM!;
      return slotMinutes >= rangeStart && slotMinutes + 30 <= rangeEnd;
    });

    if (!isInRange) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El horario seleccionado no está dentro de la disponibilidad del doctor",
      });
    }

    // ── modality-toggle (D5 / AD-13): re-read aceptaOnline INSIDE the transaction.
    // A doctor who toggles aceptaOnline to false between the patient's
    // "Confirmar" click and the mutation is caught because the in-transaction
    // read sees the new false value.
    const doctor = await tx
      .select({ aceptaOnline: schema.doctores.aceptaOnline })
      .from(schema.doctores)
      .where(eq(schema.doctores.id, doctorId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (modalidad === ConsultaModalidad.ONLINE && !doctor?.aceptaOnline) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El doctor no ofrece consultas online",
      });
    }

    const [inserted] = await tx
      .insert(schema.citas)
      .values({
        doctorId,
        pacienteId,
        fechaHora,
        estado: ConsultationStatus.PENDIENTE,
        motivo: motivoConsulta,
        duracionMinutos: 30,
        modalidad,
      })
      .returning();

    if (!inserted) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error al crear la cita",
      });
    }

    return inserted;
  });

  // Fire-and-forget analytics event — never blocks or throws
  captureEvent({
    distinctId: input.pacienteId,
    event: EVENTS.APPOINTMENT_CREATED,
    properties: { citaId: cita.id, doctorId: input.doctorId, fecha: fechaHora.toISOString() },
  });

  return cita as CreateAppointmentOutput;
}
