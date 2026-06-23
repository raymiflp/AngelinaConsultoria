import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@/infrastructure/db/schema";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";

export interface GetMyAppointmentsInput {
  doctorId?: string;
  pacienteId?: string;
  estado?: ConsultationStatus;
  limit?: number;
  offset?: number;
}

const doctorUserAlias = alias(schema.usuarios, "doctor_user");
const pacienteUserAlias = alias(schema.usuarios, "paciente_user");

/**
 * Returns citas filtered by doctor or patient, with optional status filter
 * and pagination. The response shape includes `modalidad` (modality-toggle,
 * PR-B) so the booking flow and cita detail page can render the modality
 * badge without a follow-up query.
 */
export async function getMyAppointmentsUseCase(
  db: NodePgDatabase<typeof schema>,
  input: GetMyAppointmentsInput,
): Promise<Array<{
  id: string;
  doctorId: string;
  pacienteId: string;
  fechaHora: Date;
  estado: string;
  motivo: string;
  duracionMinutos: number;
  precio: string | null;
  notas: string | null;
  modalidad: ConsultaModalidad;
  doctorNombre: string | null;
  pacienteNombre: string | null;
}>> {
  const { doctorId, pacienteId, estado, limit = 100, offset = 0 } = input;

  const conditions: ReturnType<typeof eq>[] = [];
  if (doctorId) conditions.push(eq(schema.citas.doctorId, doctorId));
  if (pacienteId) conditions.push(eq(schema.citas.pacienteId, pacienteId));
  if (estado) conditions.push(eq(schema.citas.estado, estado));

  return db
    .select({
      id: schema.citas.id,
      doctorId: schema.citas.doctorId,
      pacienteId: schema.citas.pacienteId,
      fechaHora: schema.citas.fechaHora,
      estado: schema.citas.estado,
      motivo: schema.citas.motivo,
      duracionMinutos: schema.citas.duracionMinutos,
      precio: schema.citas.precio,
      notas: schema.citas.notas,
      modalidad: schema.citas.modalidad,
      doctorNombre: doctorUserAlias.nombre,
      pacienteNombre: pacienteUserAlias.nombre,
    })
    .from(schema.citas)
    .innerJoin(schema.doctores, eq(schema.citas.doctorId, schema.doctores.id))
    .innerJoin(schema.pacientes, eq(schema.citas.pacienteId, schema.pacientes.id))
    .innerJoin(doctorUserAlias, eq(schema.doctores.usuarioId, doctorUserAlias.id))
    .innerJoin(pacienteUserAlias, eq(schema.pacientes.usuarioId, pacienteUserAlias.id))
    .where(and(...conditions))
    .orderBy(schema.citas.fechaHora)
    .limit(limit)
    .offset(offset) as unknown as Array<{
    id: string;
    doctorId: string;
    pacienteId: string;
    fechaHora: Date;
    estado: string;
    motivo: string;
    duracionMinutos: number;
    precio: string | null;
    notas: string | null;
    modalidad: ConsultaModalidad;
    doctorNombre: string | null;
    pacienteNombre: string | null;
  }>;
}
