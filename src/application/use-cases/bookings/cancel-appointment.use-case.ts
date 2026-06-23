import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultationStatus } from "@/domain/enums";

export interface CancelAppointmentInput {
  citaId: string;
  pacienteId?: string;
  doctorId?: string;
}

export interface CancelAppointmentOutput {
  ok: true;
}

/**
 * Cancels an appointment, with role-based ownership validation.
 *
 * - If `pacienteId` is provided, only that patient can cancel.
 * - If `doctorId` is provided, only that doctor can cancel.
 * - Already-cancelled/completed/no-asistio citas are rejected.
 */
export async function cancelAppointmentUseCase(
  db: NodePgDatabase<typeof schema>,
  input: CancelAppointmentInput,
  actor: { pacienteId?: string; doctorId?: string },
): Promise<CancelAppointmentOutput> {
  const { citaId } = input;

  const cita = await db
    .select()
    .from(schema.citas)
    .where(eq(schema.citas.id, citaId))
    .then((rows) => rows[0] ?? null);

  if (!cita) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cita no encontrada",
    });
  }

  // Ownership validation
  if (actor.pacienteId && cita.pacienteId !== actor.pacienteId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No puedes cancelar una cita que no te pertenece",
    });
  }
  if (actor.doctorId && cita.doctorId !== actor.doctorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No puedes cancelar una cita de otro doctor",
    });
  }

  // State validation
  if (
    cita.estado === ConsultationStatus.CANCELADA ||
    cita.estado === ConsultationStatus.COMPLETADA ||
    cita.estado === ConsultationStatus.NO_ASISTIO
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No se puede cancelar una cita en estado ${cita.estado}`,
    });
  }

  await db
    .update(schema.citas)
    .set({ estado: ConsultationStatus.CANCELADA })
    .where(eq(schema.citas.id, citaId));

  return { ok: true };
}
