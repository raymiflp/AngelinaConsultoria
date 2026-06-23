import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/infrastructure/db/schema";

export type AuditAction =
  | "CITA_CREATED"
  | "CITA_CANCELLED"
  | "CITA_STATUS_CHANGED"
  | "CITA_NOTES_UPDATED"
  | "PROFILE_UPDATED"
  | "DOCTOR_AVAILABILITY_UPDATED"
  | "PATIENT_LIST_VIEWED"
  | "APPOINTMENT_LIST_VIEWED"
  | "CITA_ROOM_TOKEN_ISSUED"
  | "DOCTOR_ACEPTA_ONLINE_CHANGED"
  // ── livekit-webhooks: written by the system actor (LiveKit server) when
  // a room_finished webhook auto-completes a cita. usuarioId is null on
  // these rows because the LiveKit server is not a human user.
  | "CITA_AUTO_COMPLETED_BY_WEBHOOK";

export interface WriteAuditLogInput {
  // `null` represents a system actor (e.g. the LiveKit server writing an
  // audit row from the room_finished webhook). Human actors continue to
  // pass a real usuarioId.
  usuarioId: string | null;
  accion: AuditAction;
  entidadAfectada: string;
  entidadId: string;
  detalles?: Record<string, unknown> | null;
  direccionIP?: string;
}

/**
 * Writes an audit log entry for compliance tracking.
 *
 * In a medical platform, every access to clinical data and every
 * state change on appointments must be traceable.
 */
export async function writeAuditLogUseCase(
  db: NodePgDatabase<typeof schema>,
  input: WriteAuditLogInput,
): Promise<void> {
  await db.insert(schema.auditLogs).values({
    usuarioId: input.usuarioId,
    accion: input.accion,
    entidadAfectada: input.entidadAfectada,
    entidadId: input.entidadId,
    detalles: input.detalles ?? null,
    direccionIP: input.direccionIP ?? "unknown",
  });
}
