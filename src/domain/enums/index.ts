/**
 * User roles for the angelina-consultoria platform.
 */
export enum UserRole {
  PACIENTE = "PACIENTE",
  DOCTOR = "DOCTOR",
  ADMIN = "ADMIN",
  DPO = "DPO",
  SUPERADMIN = "SUPERADMIN",
  TUTOR = "TUTOR",
  STAFF = "STAFF",
  CONTENT = "CONTENT",
  FINANZAS = "FINANZAS",
  ASEGURADORA = "ASEGURADORA",
}

/**
 * Consultation/appointment status values.
 */
export enum ConsultationStatus {
  PENDIENTE = "PENDIENTE",
  CONFIRMADA = "CONFIRMADA",
  EN_CURSO = "EN_CURSO",
  COMPLETADA = "COMPLETADA",
  CANCELADA = "CANCELADA",
  NO_ASISTIO = "NO_ASISTIO",
}

/**
 * Modality of a medical consultation.
 *
 * - PRESENCIAL: in-person visit at the doctor's office.
 * - ONLINE: video-call via the LiveKit-backed call page.
 *
 * The two-value union is intentional and matches the existing UserRole /
 * ConsultationStatus pattern (string TS enum, not pg_enum, not runtime class).
 */
export enum ConsultaModalidad {
  PRESENCIAL = "PRESENCIAL",
  ONLINE = "ONLINE",
}

/**
 * Valid state transitions for ConsultationStatus.
 */
const VALID_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  [ConsultationStatus.PENDIENTE]: [ConsultationStatus.CONFIRMADA, ConsultationStatus.CANCELADA],
  [ConsultationStatus.CONFIRMADA]: [ConsultationStatus.EN_CURSO, ConsultationStatus.CANCELADA],
  [ConsultationStatus.EN_CURSO]: [ConsultationStatus.COMPLETADA, ConsultationStatus.CANCELADA, ConsultationStatus.NO_ASISTIO],
  [ConsultationStatus.COMPLETADA]: [],
  [ConsultationStatus.CANCELADA]: [],
  [ConsultationStatus.NO_ASISTIO]: [],
};

/**
 * Validates whether a transition between consultation statuses is allowed.
 * Returns `true` if the transition is valid, `false` otherwise.
 */
export function canTransitionStatus(
  from: ConsultationStatus,
  to: ConsultationStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transitions a status, throwing if the transition is invalid.
 */
export function transitionStatus(
  from: ConsultationStatus,
  to: ConsultationStatus,
): ConsultationStatus {
  if (!canTransitionStatus(from, to)) {
    throw new Error(
      `Invalid status transition: ${from} → ${to}`,
    );
  }
  return to;
}
