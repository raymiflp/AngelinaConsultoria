import { z } from "zod";
import { ConsultationStatus } from "@/domain/enums";

/**
 * A single time range within a day.
 */
export interface AvailabilitySlot {
  inicio: string; // "HH:mm" format
  fin: string; // "HH:mm" format
}

/**
 * Zod schema for a single availability time range.
 */
export const availabilitySlotSchema = z
  .object({
    inicio: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
    fin: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  })
  .refine((slot) => slot.inicio < slot.fin, {
    message: "La hora de inicio debe ser anterior a la hora de fin",
  });

/**
 * Day-of-week keys used in availability records.
 */
export const DAYS_OF_WEEK = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Zod schema for the full disponibilidad record.
 * Keys are Spanish day names, values are arrays of time ranges.
 */
export const disponibilidadSchema = z.record(
  z.enum(DAYS_OF_WEEK),
  z.array(availabilitySlotSchema).min(1, "Al menos un rango horario requerido"),
);

export type Disponibilidad = z.infer<typeof disponibilidadSchema>;

/**
 * DoctorAvailability entity — weekly schedule for a doctor.
 */
export class DoctorAvailability {
  private constructor(
    readonly id: string,
    readonly doctorId: string,
    readonly disponibilidad: Disponibilidad,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static create(props: {
    doctorId: string;
    disponibilidad: Disponibilidad;
  }): DoctorAvailability {
    // Validate the disponibilidad through Zod
    const parsed = disponibilidadSchema.parse(props.disponibilidad);

    return new DoctorAvailability(
      crypto.randomUUID(),
      props.doctorId,
      parsed,
      new Date(),
      new Date(),
    );
  }

  /**
   * Check if time ranges overlap within a single day.
   */
  static hasOverlappingRanges(ranges: AvailabilitySlot[]): boolean {
    const sorted = [...ranges].sort((a, b) => a.inicio.localeCompare(b.inicio));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.inicio < sorted[i - 1]!.fin) {
        return true;
      }
    }
    return false;
  }
}

export { ConsultationStatus };
