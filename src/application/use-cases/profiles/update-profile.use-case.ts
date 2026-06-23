import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { getProfileUseCase } from "./get-profile.use-case";
import type { ProfileResponse, UpdateProfileInput } from "@/infrastructure/profiles/schemas";
import { captureEvent } from "@/infrastructure/analytics";
import { EVENTS } from "@/infrastructure/analytics/events";

/**
 * Updates the authenticated user's profile.
 * Handles both shared Usuario fields and role-specific tables.
 * Uses upsert semantics: creates the role-specific record if missing.
 */
export async function updateProfileUseCase(
  db: NodePgDatabase<typeof schema>,
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> {
  // Update shared Usuario fields
  await db
    .update(schema.usuarios)
    .set({
      nombre: input.nombre,
      telefono: input.telefono ?? "",
    })
    .where(eq(schema.usuarios.id, userId));

  if (input.rol === "DOCTOR") {
    const existing = await db
      .select({ id: schema.doctores.id })
      .from(schema.doctores)
      .where(eq(schema.doctores.usuarioId, userId))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      await db
        .update(schema.doctores)
        .set({
          numeroColegiado: input.numeroColegiado,
          especialidad: input.especialidad,
          biografia: input.biografia ?? null,
          precioConsulta: input.precioConsulta != null ? String(input.precioConsulta) : null,
        })
        .where(eq(schema.doctores.usuarioId, userId));
    } else {
      // Upsert: create doctor record if it doesn't exist
      await db.insert(schema.doctores).values({
        usuarioId: userId,
        numeroColegiado: input.numeroColegiado,
        especialidad: input.especialidad,
        biografia: input.biografia ?? null,
        precioConsulta: input.precioConsulta != null ? String(input.precioConsulta) : null,
      });
    }
  } else {
    // PACIENTE
    const existing = await db
      .select({ id: schema.pacientes.id })
      .from(schema.pacientes)
      .where(eq(schema.pacientes.usuarioId, userId))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      await db
        .update(schema.pacientes)
        .set({
          fechaNacimiento: input.fechaNacimiento,
          direccionCalle: input.direccion.calle,
          direccionCiudad: input.direccion.ciudad,
          direccionProvincia: input.direccion.provincia,
          direccionCodigoPostal: input.direccion.codigoPostal,
          direccionPais: input.direccion.pais,
          alergias: input.alergias,
          grupoSanguineo: input.grupoSanguineo ?? null,
          notasMedicas: input.notasMedicas ?? null,
        })
        .where(eq(schema.pacientes.usuarioId, userId));
    } else {
      // Upsert: create paciente record if it doesn't exist
      await db.insert(schema.pacientes).values({
        usuarioId: userId,
        fechaNacimiento: input.fechaNacimiento,
        direccionCalle: input.direccion.calle,
        direccionCiudad: input.direccion.ciudad,
        direccionProvincia: input.direccion.provincia,
        direccionCodigoPostal: input.direccion.codigoPostal,
        direccionPais: input.direccion.pais,
        alergias: input.alergias,
        grupoSanguineo: input.grupoSanguineo ?? null,
        notasMedicas: input.notasMedicas ?? null,
      });
    }
  }

  // Fire-and-forget analytics event — never blocks or throws
  captureEvent({
    distinctId: userId,
    event: EVENTS.PROFILE_UPDATED,
    properties: { rol: input.rol },
  });

  return getProfileUseCase(db, userId);
}
