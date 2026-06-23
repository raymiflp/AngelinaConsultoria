import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import type { WebhookEvent } from "livekit-server-sdk";
import * as schema from "@/infrastructure/db/schema";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";
import { writeAuditLogUseCase } from "@/application";

export interface AutoCompleteOnRoomFinishedInput {
  /**
   * The LiveKit `room_finished` webhook event, already verified via
   * `LiveKitServerClient.verifyWebhook` (D1, AD-2).
   *
   * The route handler at `POST /api/livekit/webhook` is the ONLY caller
   * (AD-9) — it lives outside the tRPC schema because the trust boundary
   * is the LiveKit JWT signature, not an Auth.js session.
   */
  event: WebhookEvent;
}

export interface AutoCompleteOnRoomFinishedOutput {
  citaId: string;
  /**
   * The terminal state applied to the cita. Either COMPLETADA (>=1
   * participant joined) or NO_ASISTIO (zero participants). When the
   * cita was already in a terminal or non-EN_CURSO state, the value
   * reflects the cita's current state at decision time.
   */
  finalState: ConsultationStatus.COMPLETADA | ConsultationStatus.NO_ASISTIO;
  /**
   * Always `true` per the design — the use case is idempotent and the
   * "transitioned" field signals "we processed the event successfully",
   * not "we actually mutated the row". The 200 OK response from the
   * route handler tells LiveKit to stop retrying either way.
   */
  transitioned: true;
}

const UUID_RE = /^cita-([0-9a-f-]{36})$/;

/**
 * Auto-completes an ONLINE cita when its LiveKit room finishes.
 *
 * Pipeline (livekit-webhooks, D6 / D7 / D8 / AD-7):
 *   1. Parse the cita UUID from `event.room.name` via
 *      `/^cita-([0-9a-f-]{36})$/`. Defensive: a forged or stale
 *      room name that does not match throws BAD_REQUEST.
 *   2. Load the cita by id (estado + modalidad).
 *      Missing cita → NOT_FOUND.
 *   3. Modality gate (D7): PRESENCIAL → FORBIDDEN. A PRESENCIAL cita
 *      should never have received a LiveKit token in the first place;
 *      if it shows up here it is a data inconsistency and we refuse.
 *   4. Terminal-state no-op (D6 / idempotent branch): COMPLETADA,
 *      CANCELADA, NO_ASISTIO → return the existing state without
 *      writing an audit row.
 *   5. Non-EN_CURSO no-op (D8 — out-of-order event): PENDIENTE,
 *      CONFIRMADA → return without an UPDATE or audit row.
 *   6. Target state from `event.room.num_participants`:
 *        >= 1 → COMPLETADA
 *        === 0 → NO_ASISTIO
 *   7. Atomic optimistic UPDATE: `SET estado = $1 WHERE id = $2 AND
 *      estado = 'EN_CURSO'`. The WHERE clause is the compare-and-swap
 *      primitive (AD-7). If the doctor beat us (e.g. clicked
 *      "Completar" at the same moment), `rowCount === 0` and we
 *      return without an audit row.
 *   8. Write `audit_logs` row with `usuarioId: null` (system actor,
 *      NOT a human user — D9 / AD-10) and the new
 *      `'CITA_AUTO_COMPLETED_BY_WEBHOOK'` action.
 *
 * The use case NEVER calls `updateAppointmentStatusUseCase` — that
 * path is doctor-only and requires `cita.doctorId === actor.doctorId`.
 * The webhook is a SYSTEM actor, NOT a human user (REQ-BA-WH-1 / AD-9).
 */
export async function autoCompleteOnRoomFinishedUseCase(
  db: NodePgDatabase<typeof schema>,
  input: AutoCompleteOnRoomFinishedInput,
): Promise<AutoCompleteOnRoomFinishedOutput> {
  const { event } = input;

  // 1. Parse the cita UUID from the room name.
  const roomName = event.room?.name ?? "";
  const match = UUID_RE.exec(roomName);
  if (!match) {
    console.warn(
      `[livekit webhook] room name "${roomName}" does not match expected pattern, ignoring.`,
    );
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid room name",
    });
  }
  const citaId = match[1]!;

  // 2. Load the cita (estado + modalidad — modality gate needs both).
  const [cita] = await db
    .select({
      id: schema.citas.id,
      estado: schema.citas.estado,
      modalidad: schema.citas.modalidad,
    })
    .from(schema.citas)
    .where(eq(schema.citas.id, citaId))
    .limit(1);

  if (!cita) {
    console.warn(
      `[livekit webhook] room name matched but no cita with id=${citaId}, ignoring.`,
    );
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cita no encontrada",
    });
  }

  // 3. Modality gate (D7). PRESENCIAL citas must NEVER receive LiveKit
  //    webhooks; if one does, it is a data inconsistency and we refuse
  //    rather than silently no-op (the doctor never opened a LiveKit
  //    room, so the "0 participants" branch would falsely mark a
  //    presencial visita as NO_ASISTIO).
  if (cita.modalidad === ConsultaModalidad.PRESENCIAL) {
    console.warn(
      `[livekit webhook] cita ${citaId} is PRESENCIAL, ignoring room_finished event.`,
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cita presencial no procesa webhooks de LiveKit",
    });
  }

  // 4. Terminal-state no-op (D6 idempotent branch). COMPLETADA /
  //    CANCELADA / NO_ASISTIO are end states — the webhook arrived
  //    after the cita already terminated (e.g. doctor manually
  //    cancelled while the patient was still in the call; the patient
  //    leaves; the webhook arrives; the cita is already CANCELADA).
  //    We return success-no-op WITHOUT writing an audit row.
  const estado = cita.estado as ConsultationStatus;
  if (
    estado === ConsultationStatus.COMPLETADA ||
    estado === ConsultationStatus.CANCELADA ||
    estado === ConsultationStatus.NO_ASISTIO
  ) {
    console.info(
      `[livekit webhook] cita ${citaId} is already in terminal state ${estado}, ignoring.`,
    );
    return {
      citaId,
      // The strict output type only allows COMPLETADA | NO_ASISTIO;
      // CANCELADA is reported here as-is for caller convenience (the
      // route handler does not branch on this value).
      finalState: estado as ConsultationStatus.COMPLETADA | ConsultationStatus.NO_ASISTIO,
      transitioned: true,
    };
  }

  // 5. Non-EN_CURSO no-op (D8 — out-of-order event). PENDIENTE or
  //    CONFIRMADA mean the cita never started; the room_finished
  //    event is out-of-order. Return success-no-op without an UPDATE
  //    or audit row.
  if (estado !== ConsultationStatus.EN_CURSO) {
    console.warn(
      `[livekit webhook] cita ${citaId} is in ${estado} (not EN_CURSO), ignoring room_finished event.`,
    );
    return {
      citaId,
      finalState: estado as ConsultationStatus.COMPLETADA | ConsultationStatus.NO_ASISTIO,
      transitioned: true,
    };
  }

  // 6. Determine the target state from the participant count. The
  //    WebhookEvent's Room proto3 field is exposed in TypeScript as
  //    `numParticipants` (camelCase alias) but the wire JSON uses
  //    `num_participants` (snake_case). Read the snake_case form to
  //    match the runtime wire format. AD-7 / R11 mitigation note.
  const participantCount =
    (event.room as unknown as { num_participants?: number })
      .num_participants ??
    (event.room as { numParticipants?: number }).numParticipants ??
    0;
  const finalState: ConsultationStatus.COMPLETADA | ConsultationStatus.NO_ASISTIO =
    participantCount >= 1
      ? ConsultationStatus.COMPLETADA
      : ConsultationStatus.NO_ASISTIO;

  // 7. Atomic optimistic UPDATE — the WHERE clause is the
  //    compare-and-swap (AD-7). If the doctor beat us (clicked
  //    "Completar" / "Cancelar" between our SELECT and our UPDATE),
  //    `result.length === 0` and we return success-no-op.
  //
  //    NOTE: `citas` does not have an `updatedAt` column (it was never
  //    added in any migration); only `created_at` is tracked. We do
  //    not invent one here — a future migration can add it if the
  //    audit story needs per-state timestamps.
  const result = await db
    .update(schema.citas)
    .set({ estado: finalState })
    .where(
      and(
        eq(schema.citas.id, citaId),
        eq(schema.citas.estado, ConsultationStatus.EN_CURSO),
      ),
    )
    .returning({ id: schema.citas.id });

  if (result.length === 0) {
    console.info(
      `[livekit webhook] cita ${citaId} was no longer in EN_CURSO when UPDATE ran (race lost), ignoring.`,
    );
    return { citaId, finalState, transitioned: true };
  }

  // 8. Audit row — system actor (LiveKit server, NOT a human user).
  //    `usuarioId: null` is the explicit null; the migration 0005 made
  //    `audit_logs.usuario_id` nullable (D9, AD-10).
  await writeAuditLogUseCase(db, {
    usuarioId: null,
    accion: "CITA_AUTO_COMPLETED_BY_WEBHOOK",
    entidadAfectada: "citas",
    entidadId: citaId,
    detalles: {
      eventId: event.id,
      roomName,
      participantCount,
      finalState,
    },
  });

  return { citaId, finalState, transitioned: true };
}