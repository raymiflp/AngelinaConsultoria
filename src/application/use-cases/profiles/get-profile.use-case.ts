import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import type { ProfileResponse } from "@/infrastructure/profiles/schemas";

/**
 * Converts a Drizzle numeric column value (string | null) to number | null.
 */
function toNumber(val: string | null): number | null {
  if (val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Fetches the full profile for a given usuario ID, branching by role.
 */
export async function getProfileUseCase(
  db: NodePgDatabase<typeof schema>,
  userId: string,
): Promise<ProfileResponse> {
  const user = await db
    .select()
    .from(schema.usuarios)
    .where(eq(schema.usuarios.id, userId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Usuario no encontrado",
    });
  }

  const base: ProfileResponse = {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    telefono: user.telefono,
    rol: user.rol as "DOCTOR" | "PACIENTE",
    activo: user.activo,
  };

  if (user.rol === "DOCTOR") {
    const doctor = await db
      .select()
      .from(schema.doctores)
      .where(eq(schema.doctores.usuarioId, userId))
      .then((rows) => rows[0] ?? null);

    base.doctor = doctor
      ? {
          id: doctor.id,
          numeroColegiado: doctor.numeroColegiado,
          especialidad: doctor.especialidad,
          biografia: doctor.biografia,
          precioConsulta: toNumber(doctor.precioConsulta),
          verificado: doctor.verificado,
          calificacionMedia: toNumber(doctor.calificacionMedia),
          aceptaOnline: doctor.aceptaOnline,
        }
      : null;
  } else if (user.rol === "PACIENTE") {
    const paciente = await db
      .select()
      .from(schema.pacientes)
      .where(eq(schema.pacientes.usuarioId, userId))
      .then((rows) => rows[0] ?? null);

    base.paciente = paciente
      ? {
          id: paciente.id,
          fechaNacimiento: paciente.fechaNacimiento,
          direccionCalle: paciente.direccionCalle,
          direccionCiudad: paciente.direccionCiudad,
          direccionProvincia: paciente.direccionProvincia,
          direccionCodigoPostal: paciente.direccionCodigoPostal,
          direccionPais: paciente.direccionPais,
          alergias: paciente.alergias,
          grupoSanguineo: paciente.grupoSanguineo,
          notasMedicas: paciente.notasMedicas,
        }
      : null;
  }

  return base;
}
