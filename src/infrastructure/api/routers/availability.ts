import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/infrastructure/db";
import { doctores, doctorDisponibilidad } from "@/infrastructure/db/schema";
import { UserRole } from "@/domain/enums";
import { setAvailabilitySchema } from "@/infrastructure/booking/schemas";

/**
 * Resolve the doctor DB record for the authenticated session.
 */
async function findDoctorByUserId(userId: string) {
  return db
    .select()
    .from(doctores)
    .where(eq(doctores.usuarioId, userId))
    .then((rows) => rows[0] ?? null);
}

/**
 * Guard: ensures the caller is a DOCTOR.
 */
function requireDoctor(ctx: { session: { user: { role: string } } }) {
  if (ctx.session.user.role !== UserRole.DOCTOR) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los doctores pueden gestionar disponibilidad",
    });
  }
}

/**
 * Check if time ranges within a day overlap.
 */
function hasOverlappingRanges(
  ranges: Array<{ inicio: string; fin: string }>,
): boolean {
  const sorted = [...ranges].sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.inicio < sorted[i - 1]!.fin) {
      return true;
    }
  }
  return false;
}

/**
 * Availability router — doctor schedule CRUD.
 */
export const availabilityRouter = router({
  /**
   * getMyAvailability (protected, DOCTOR)
   *
   * Returns the authenticated doctor's weekly schedule.
   * Returns empty object `{}` when no schedule is configured.
   */
  getMyAvailability: protectedProcedure.query(async ({ ctx }) => {
    requireDoctor(ctx);

    const userId = ctx.session.user.id;
    const doctorRecord = await findDoctorByUserId(userId);

    if (!doctorRecord) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Perfil de doctor no encontrado",
      });
    }

    const availability = await db
      .select()
      .from(doctorDisponibilidad)
      .where(eq(doctorDisponibilidad.doctorId, doctorRecord.id))
      .then((rows) => rows[0] ?? null);

    if (!availability) {
      return {};
    }

    return availability.disponibilidad as Record<
      string,
      Array<{ inicio: string; fin: string }>
    >;
  }),

  /**
   * setAvailability (protected, DOCTOR)
   *
   * Creates or replaces the doctor's weekly schedule (UPSERT).
   * Validates:
   * - Each range has `inicio < fin`
   * - No overlapping ranges within the same day
   */
  setAvailability: protectedProcedure
    .input(setAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx);

      const userId = ctx.session.user.id;
      const doctorRecord = await findDoctorByUserId(userId);

      if (!doctorRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil de doctor no encontrado",
        });
      }

      // Validate no overlapping ranges per day
      for (const [day, ranges] of Object.entries(input.disponibilidad)) {
        if (hasOverlappingRanges(ranges)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `El día ${day} tiene rangos horarios que se superponen`,
          });
        }
      }

      // UPSERT: insert if not exists, update if exists
      const existing = await db
        .select({ id: doctorDisponibilidad.id })
        .from(doctorDisponibilidad)
        .where(eq(doctorDisponibilidad.doctorId, doctorRecord.id))
        .then((rows) => rows[0] ?? null);

      if (existing) {
        await db
          .update(doctorDisponibilidad)
          .set({
            disponibilidad: input.disponibilidad,
            updatedAt: new Date(),
          })
          .where(eq(doctorDisponibilidad.id, existing.id));
      } else {
        await db.insert(doctorDisponibilidad).values({
          doctorId: doctorRecord.id,
          disponibilidad: input.disponibilidad,
        });
      }

      return { ok: true as const };
    }),
});
