"use client";

import { useRouter } from "next/navigation";
import { Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";

/**
 * JoinCallButton — entry point to the video call page.
 *
 * Self-hides (returns `null`) when the cita's status, time-window, or
 * modality gate does not pass. The visibility rule mirrors the server-side
 * gate in `getRoomTokenUseCase` (defense in depth — the procedure
 * re-validates the same rule on every call).
 *
 * Visibility state machine (per design §8):
 *
 *   start
 *     │
 *     ▼
 *   modalidad === PRESENCIAL?  ─── YES ──► return null (HIDDEN_MODALITY)
 *     │ NO
 *     ▼
 *   estado === EN_CURSO?       ─── YES ──► render <Button> (VISIBLE)
 *     │ NO
 *     ▼
 *   estado === CONFIRMADA AND
 *   |now - fechaHora| <= 15 min? ── YES ─► render <Button> (VISIBLE)
 *     │ NO
 *     ▼
 *   estado ∈ {PENDIENTE, COMPLETADA,
 *   CANCELADA, NO_ASISTIO}?    ── YES ──► return null (HIDDEN_STATUS)
 *
 * The modality gate runs FIRST (modality-toggle, PR-B, D7). A PRESENCIAL
 * cita MUST NEVER render the button, regardless of estado or time window.
 * The prop is REQUIRED (NOT optional) — a missing prop is a TypeScript
 * compile error, NOT a runtime fallback (per D7 / AD-7).
 */
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

export interface JoinCallButtonProps {
  citaId: string;
  estado: ConsultationStatus;
  fechaHora: Date;
  /**
   * Reserved for future role-aware copy (D7 commits to a single label in MVP).
   * Declared in the type so the call site can pass role context without
   * refactoring the component when a doctor/patient label split lands.
   */
  isDoctor: boolean;
  /**
   * Cita modality. REQUIRED (modality-toggle, PR-B). For `PRESENCIAL`,
   * the button is hidden unconditionally — see the state machine above.
   */
  modalidad: ConsultaModalidad;
}

export function JoinCallButton(props: JoinCallButtonProps) {
  const router = useRouter();

  // Hard modality gate (modality-toggle, PR-B, D7). Runs FIRST, before
  // any status / time-window check. Returning `null` is the cleanest
  // expression of "this UI doesn't apply" — the modality badge on the
  // cita detail page already tells the user this is a presencial cita.
  if (props.modalidad === ConsultaModalidad.PRESENCIAL) return null;

  const inWindow =
    Math.abs(Date.now() - props.fechaHora.getTime()) <= FIFTEEN_MIN_MS;
  const isVisible =
    props.estado === ConsultationStatus.EN_CURSO ||
    (props.estado === ConsultationStatus.CONFIRMADA && inWindow);

  if (!isVisible) return null;

  return (
    <Button
      className="w-full sm:w-auto"
      onClick={() => router.push(`/citas/${props.citaId}/llamada`)}
    >
      <Video className="mr-2 size-4" aria-hidden="true" />
      Unirse a la videollamada
    </Button>
  );
}
