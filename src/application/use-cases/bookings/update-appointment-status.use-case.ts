import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultationStatus, transitionStatus } from "@/domain/enums";
import { captureEvent } from "@/infrastructure/analytics";
import { EVENTS } from "@/infrastructure/analytics/events";

export interface UpdateAppointmentStatusInput {
  citaId: string;
  doctorId: string;
  nuevoEstado: ConsultationStatus;
}

/**
 * Transitions a cita to a new status, validating the state machine
 * and doctor ownership before applying the change.
 */
export async function updateAppointmentStatusUseCase(
  db: NodePgDatabase<typeof schema>,
  input: UpdateAppointmentStatusInput,
): Promise<typeof schema.citas.$inferSelect> {
  const { citaId, doctorId, nuevoEstado } = input;

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

  if (cita.doctorId !== doctorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No puedes modificar el estado de una cita de otro doctor",
    });
  }

  try {
    transitionStatus(cita.estado as ConsultationStatus, nuevoEstado);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Transición de estado inválida: ${cita.estado} → ${nuevoEstado}`,
    });
  }

  const [updated] = await db
    .update(schema.citas)
    .set({ estado: nuevoEstado })
    .where(eq(schema.citas.id, citaId))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al actualizar el estado de la cita",
    });
  }

  // Fire-and-forget analytics event — never blocks or throws
  captureEvent({
    distinctId: input.doctorId,
    event:
      input.nuevoEstado === ConsultationStatus.CANCELADA
        ? EVENTS.APPOINTMENT_CANCELLED
        : EVENTS.APPOINTMENT_STATUS_CHANGED,
    properties: { citaId: input.citaId, from: cita.estado, to: input.nuevoEstado },
  });

  return updated;
}
