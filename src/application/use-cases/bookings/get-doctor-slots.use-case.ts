import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, gte, lt, ne } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { ConsultationStatus } from "@/domain/enums";
import { getDayName, formatHHMM, generateSlots } from "@/infrastructure/booking/slot-utils";
import type { Slot } from "@/infrastructure/booking/slot-utils";

export interface GetDoctorSlotsInput {
  doctorId: string;
  date: string;
}

/**
 * Returns all 30-min slots for a doctor on a given date,
 * marking each as available or booked based on existing citas.
 *
 * Pure business logic — no auth checks, no side effects.
 */
export async function getDoctorSlotsUseCase(
  db: NodePgDatabase<typeof schema>,
  input: GetDoctorSlotsInput,
): Promise<Slot[]> {
  const { doctorId, date } = input;

  const availability = await db
    .select()
    .from(schema.doctorDisponibilidad)
    .where(eq(schema.doctorDisponibilidad.doctorId, doctorId))
    .then((rows) => rows[0] ?? null);

  if (!availability) return [];

  const disponibilidad = availability.disponibilidad as Record<
    string,
    Array<{ inicio: string; fin: string }>
  >;

  const dayName = getDayName(new Date(date + "T12:00:00"));
  const dayRanges = disponibilidad[dayName];

  if (!dayRanges || dayRanges.length === 0) return [];

  const dateStart = new Date(`${date}T00:00:00`);
  const dateEnd = new Date(`${date}T23:59:59.999`);

  const existingCitas = await db
    .select({ fechaHora: schema.citas.fechaHora })
    .from(schema.citas)
    .where(
      and(
        eq(schema.citas.doctorId, doctorId),
        gte(schema.citas.fechaHora, dateStart),
        lt(schema.citas.fechaHora, dateEnd),
        ne(schema.citas.estado, ConsultationStatus.CANCELADA),
        ne(schema.citas.estado, ConsultationStatus.NO_ASISTIO),
      ),
    );

  const bookedTimes = new Set(
    existingCitas.map((c) => formatHHMM(new Date(c.fechaHora))),
  );

  return generateSlots(date, dayRanges, bookedTimes);
}
