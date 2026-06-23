import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { writeAuditLogUseCase } from "@/application";

export interface UpdateAcceptsOnlineInput {
  doctorId: string;
  aceptaOnline: boolean;
  actorId: string;
  ipAddress?: string;
}

export interface UpdateAcceptsOnlineOutput {
  id: string;
  aceptaOnline: boolean;
}

/**
 * Flips a doctor's `acepta_online` preference and writes the matching audit
 * log row in the same transaction.
 *
 * DOCTOR-only enforcement lives at the procedure layer (the procedure
 * checks `ctx.session.user.role === 'DOCTOR'`); this use case trusts the
 * input. The UPDATE and the audit log write are inside the same
 * `db.transaction` so a partial write cannot leave the toggle flipped
 * without an audit row (per REQ-BA-MOD-4 / D9).
 *
 * Returns `{ id, aceptaOnline }` so the client can update its local state
 * without a follow-up `getMyProfile` round-trip.
 */
export async function updateAcceptsOnlineUseCase(
  db: NodePgDatabase<typeof schema>,
  input: UpdateAcceptsOnlineInput,
): Promise<UpdateAcceptsOnlineOutput> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.doctores)
      .set({ aceptaOnline: input.aceptaOnline })
      .where(eq(schema.doctores.id, input.doctorId))
      .returning({
        id: schema.doctores.id,
        aceptaOnline: schema.doctores.aceptaOnline,
      });

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Doctor no encontrado",
      });
    }

    await writeAuditLogUseCase(tx as never, {
      usuarioId: input.actorId,
      accion: "DOCTOR_ACEPTA_ONLINE_CHANGED",
      entidadAfectada: "doctores",
      entidadId: input.doctorId,
      detalles: { aceptaOnline: input.aceptaOnline },
      direccionIP: input.ipAddress ?? "unknown",
    });

    return { id: updated.id, aceptaOnline: updated.aceptaOnline };
  });
}
