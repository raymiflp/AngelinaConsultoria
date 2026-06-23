import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, sql, and, ne } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultationStatus } from "@/domain/enums";

export interface GetMyPatientsInput {
  doctorId: string;
  limit?: number;
  offset?: number;
}

export interface PatientSummary {
  pacienteId: string;
  nombre: string;
  email: string;
  telefono: string;
  totalVisitas: number;
  ultimaVisita: string;
  proximaCita: string | null;
}

/**
 * Returns distinct patients who have had appointments with the given doctor,
 * with total visit count, last visit date, and next upcoming appointment.
 */
export async function getMyPatientsUseCase(
  db: NodePgDatabase<typeof schema>,
  input: GetMyPatientsInput,
): Promise<PatientSummary[]> {
  const { doctorId, limit = 50, offset = 0 } = input;

  const rows = await db
    .select({
      pacienteId: schema.pacientes.id,
      nombre: schema.usuarios.nombre,
      email: schema.usuarios.email,
      telefono: schema.usuarios.telefono,
      totalVisitas: sql<number>`count(${schema.citas.id})::int`,
      ultimaVisita: sql<string>`max(${schema.citas.fechaHora})`,
      proximaCita: sql<string | null>`
        min(CASE WHEN ${schema.citas.estado} IN (
          ${sql.param(ConsultationStatus.PENDIENTE)},
          ${sql.param(ConsultationStatus.CONFIRMADA)}
        ) AND ${schema.citas.fechaHora} > now() THEN ${schema.citas.fechaHora} END)
      `,
    })
    .from(schema.citas)
    .innerJoin(schema.pacientes, eq(schema.citas.pacienteId, schema.pacientes.id))
    .innerJoin(schema.usuarios, eq(schema.pacientes.usuarioId, schema.usuarios.id))
    .where(eq(schema.citas.doctorId, doctorId))
    .groupBy(
      schema.pacientes.id,
      schema.usuarios.nombre,
      schema.usuarios.email,
      schema.usuarios.telefono,
    )
    .orderBy(sql`max(${schema.citas.fechaHora}) desc`)
    .limit(limit)
    .offset(offset);

  return rows;
}
