import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultaModalidad, ConsultationStatus, UserRole } from "@/domain/enums";
import { livekitServerClient } from "@/infrastructure/livekit/livekit-server";

export interface GetRoomTokenInput {
  citaId: string;
  actor: { id: string; role: UserRole };
}

export interface GetRoomTokenOutput {
  token: string;
  serverUrl: string;
  roomName: string;
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/**
 * Issues a LiveKit access token for the given cita.
 *
 * Authorization model:
 *   1. The cita must exist.
 *   2. The actor must be EITHER the cita's doctor (via `doctores.usuarioId`)
 *      OR the cita's patient (via `pacientes.usuarioId`).
 *   3. The cita must be in `EN_CURSO` (any time) or `CONFIRMADA` within a
 *      symmetric ±15 minute window around `fechaHora`.
 *   4. (modality-toggle, D6) The cita must NOT be `PRESENCIAL`. PRESENCIAL
 *      citas get a `FORBIDDEN` with the modality-specific Spanish message.
 *      The modality gate is the LAST gate before token issuance, AFTER
 *      the status / time-window gate, so a PRESENCIAL cita outside the
 *      time window still gets the time-window message (R2 / D6 mitigation).
 *
 * AD-11: "cita not found" and "actor is not a participant" share the same
 * `NOT_FOUND` shape so a non-participant cannot probe cita existence.
 * AD-12 (audit): the audit log write lives in the procedure, NOT here, so
 * the procedure can wrap it in `try/catch` and not leak the boundary into
 * the use case.
 */
export async function getRoomTokenUseCase(
  db: NodePgDatabase<typeof schema>,
  input: GetRoomTokenInput,
): Promise<GetRoomTokenOutput> {
  // 1. Load cita with doctor.usuarioId and paciente.usuarioId in a single query.
  //    `modalidad` was added in PR-A and is the modality gate's source of truth.
  const [row] = await db
    .select({
      id: schema.citas.id,
      fechaHora: schema.citas.fechaHora,
      estado: schema.citas.estado,
      modalidad: schema.citas.modalidad,
      doctorUsuarioId: schema.doctores.usuarioId,
      pacienteUsuarioId: schema.pacientes.usuarioId,
    })
    .from(schema.citas)
    .innerJoin(schema.doctores, eq(schema.citas.doctorId, schema.doctores.id))
    .innerJoin(schema.pacientes, eq(schema.citas.pacienteId, schema.pacientes.id))
    .where(eq(schema.citas.id, input.citaId))
    .limit(1);

  // 2. AD-11: cita not found AND non-participant share the same NOT_FOUND shape.
  const isParticipant =
    !!row &&
    (row.doctorUsuarioId === input.actor.id || row.pacienteUsuarioId === input.actor.id);
  if (!isParticipant) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  // 3. Status + time-window gate.
  //    (At this point the actor is confirmed to be a participant — non-participant
  //    cases threw NOT_FOUND above.)
  const estado = row.estado as ConsultationStatus;
  const inWindow = Math.abs(Date.now() - row.fechaHora.getTime()) <= FIFTEEN_MIN_MS;

  if (estado === ConsultationStatus.EN_CURSO) {
    // pass — time bypassed
  } else if (estado === ConsultationStatus.CONFIRMADA) {
    if (!inWindow) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "La videollamada se habilita 15 minutos antes de la hora de la cita.",
      });
    }
    // pass
  } else if (estado === ConsultationStatus.PENDIENTE) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "La cita debe estar confirmada antes de unirse a la videollamada.",
    });
  } else {
    // COMPLETADA / CANCELADA / NO_ASISTIO
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta cita ya no permite unirse a una videollamada.",
    });
  }

  // 4. modality-toggle gate (D6). Modality is the LAST gate before token
  //    issuance. A PRESENCIAL cita must NEVER receive a LiveKit JWT, even
  //    if it passed the status / time window. The message is distinct from
  //    the status / time-window messages so the caller can render the right
  //    copy (the modality is the WHY, the status is the WHEN).
  if (row.modalidad === ConsultaModalidad.PRESENCIAL) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta cita es presencial, no permite videollamada",
    });
  }

  // 5. Issue the token. Room name is derived server-side from cita.id.
  const roomName = `cita-${row.id}`;
  const identity = `${input.actor.role.toLowerCase()}-${input.actor.id}`;
  return livekitServerClient.createRoomToken({ identity, roomName, ttl: "1h" });
}
