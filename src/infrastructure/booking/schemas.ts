import { z } from "zod";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";

/**
 * ─── Availability Schemas ─────────────────────────────────────────────
 */

const timeSlotSchema = z
  .object({
    inicio: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
    fin: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  })
  .refine((slot) => slot.inicio < slot.fin, {
    message: "La hora de inicio debe ser anterior a la hora de fin",
  });

const DAYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

/**
 * Schema for setting weekly availability.
 * Validates that time ranges within each day do not overlap.
 */
export const setAvailabilitySchema = z.object({
  disponibilidad: z.record(
    z.enum(DAYS),
    z
      .array(timeSlotSchema)
      .min(1, "Al menos un rango horario por día"),
  ),
});

export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

/**
 * ─── Appointment Schemas ──────────────────────────────────────────────
 */

/**
 * Schema for creating a new appointment.
 * `fechaHora` must be in the future (validated procedurally).
 * `modalidad` is REQUIRED (modality-toggle, PR-B) — the use case gates
 * `ONLINE` against the doctor's `acepta_online` flag inside the transaction.
 */
export const createAppointmentSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
  fechaHora: z.string().datetime({ message: "Fecha y hora inválida" }),
  motivoConsulta: z
    .string()
    .min(1, "El motivo de consulta es requerido")
    .max(1000, "El motivo no puede exceder 1000 caracteres"),
  modalidad: z.nativeEnum(ConsultaModalidad, {
    errorMap: () => ({
      message: "Modalidad inválida: debe ser PRESENCIAL u ONLINE",
    }),
  }),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Schema for cancelling an appointment.
 */
export const cancelAppointmentSchema = z.object({
  citaId: z.string().uuid("ID de cita inválido"),
  motivo: z.string().optional(),
});

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

/**
 * Schema for updating appointment status.
 * Uses `nuevoEstado` to match the design spec nomenclature.
 */
export const updateStatusSchema = z.object({
  citaId: z.string().uuid("ID de cita inválido"),
  nuevoEstado: z.nativeEnum(ConsultationStatus, {
    errorMap: () => ({ message: "Estado de consulta inválido" }),
  }),
  motivo: z.string().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/**
 * Schema for updating appointment notes.
 */
export const updateNotesSchema = z.object({
  citaId: z.string().uuid("ID de cita inválido"),
  notas: z.string().max(5000, "Las notas no pueden exceder 5000 caracteres"),
});

export type UpdateNotesInput = z.infer<typeof updateNotesSchema>;

/**
 * Schema for date query parameters.
 */
export const dateSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido"),
});

export type DateQueryInput = z.infer<typeof dateSchema>;
