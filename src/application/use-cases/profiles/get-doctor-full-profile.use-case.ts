import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, asc, desc } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import type { DoctorFullProfileResponse } from "@/infrastructure/profiles/schemas";

/**
 * Converts a Drizzle numeric column value (string | null) to number | null.
 */
function toNumber(val: string | null): number | null {
  if (val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Fetches the full doctor profile including hero fields, experience,
 * services (active only), and conditions.
 */
export async function getDoctorFullProfileUseCase(
  db: NodePgDatabase<typeof schema>,
  doctorId: string,
): Promise<DoctorFullProfileResponse> {
  const doctor = await db.query.doctores.findFirst({
    where: eq(schema.doctores.id, doctorId),
    with: {
      usuario: true,
      experiencia: {
        orderBy: [asc(schema.doctorExperiencia.orden), desc(schema.doctorExperiencia.fechaInicio)],
      },
      servicios: {
        where: eq(schema.doctorServicios.activo, true),
        orderBy: [asc(schema.doctorServicios.orden)],
      },
      condiciones: {
        orderBy: [asc(schema.doctorCondiciones.nombre)],
      },
    },
  });

  if (!doctor || !doctor.usuario) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Doctor no encontrado",
    });
  }

  return {
    id: doctor.id,
    nombre: doctor.usuario.nombre,
    email: doctor.usuario.email,
    especialidad: doctor.especialidad,
    biografia: doctor.biografia ?? null,
    precioConsulta: toNumber(doctor.precioConsulta),
    calificacionMedia: toNumber(doctor.calificacionMedia),
    fotoUrl: doctor.fotoUrl ?? null,
    ubicacionConsulta: doctor.ubicacionConsulta ?? null,
    añosExperiencia: doctor.añosExperiencia ?? null,
    idiomas: doctor.idiomas ?? [],
    telefonoConsulta: doctor.telefonoConsulta ?? null,
    numeroColegiado: doctor.numeroColegiado,
    totalReviews: 0,
    aceptaOnline: doctor.aceptaOnline,
    experience: (doctor.experiencia ?? []).map((exp) => ({
      id: exp.id,
      tipo: exp.tipo as "education" | "work",
      titulo: exp.titulo,
      institucion: exp.institucion,
      fechaInicio: exp.fechaInicio,
      fechaFin: exp.fechaFin ?? null,
      descripcion: exp.descripcion ?? null,
      orden: exp.orden,
    })),
    services: (doctor.servicios ?? []).map((svc) => ({
      id: svc.id,
      nombre: svc.nombre,
      descripcion: svc.descripcion ?? null,
      precio: Number(svc.precio),
      duracionMinutos: svc.duracionMinutos ?? null,
      activo: svc.activo,
      orden: svc.orden,
    })),
    conditions: (doctor.condiciones ?? []).map((cond) => ({
      id: cond.id,
      nombre: cond.nombre,
    })),
  };
}
