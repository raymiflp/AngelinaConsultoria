import { TRPCError } from "@trpc/server";
import { eq, and, ilike, asc } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { db } from "@/infrastructure/db";
import { usuarios, doctores, doctorServicios } from "@/infrastructure/db/schema";
import { updateProfileSchema, getDoctorFullProfileSchema, getDoctorServicesSchema } from "@/infrastructure/profiles/schemas";
import type { DoctorPublicResponse, DoctorServiceResponse } from "@/infrastructure/profiles/schemas";
import {
  getProfileUseCase,
  updateProfileUseCase,
  writeAuditLogUseCase,
  getDoctorFullProfileUseCase,
  getHomeStatsUseCase,
  updateAcceptsOnlineUseCase,
} from "@/application";
import { UserRole } from "@/domain/enums";

// ─── Helpers ───────────────────────────────────────────────────────────

function toNumber(val: string | null): number | null {
  if (val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

// ─── Router ────────────────────────────────────────────────────────────

export const profilesRouter = router({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    return getProfileUseCase(db as never, ctx.session.user.id);
  }),

  updateMyProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const result = await updateProfileUseCase(db as never, userId, input);

      // Audit log
      await writeAuditLogUseCase(db as never, {
        usuarioId: userId,
        accion: "PROFILE_UPDATED",
        entidadAfectada: "usuario",
        entidadId: userId,
        detalles: { rol: input.rol },
      });

      return result;
    }),

  /**
   * updateAcceptsOnline — doctor-side opt-in/out for online (video-call)
   * consultations. DOCTOR-only; rejects other roles with FORBIDDEN. The
   * use case writes the toggle + the audit row in a single transaction.
   */
  updateAcceptsOnline: protectedProcedure
    .input(z.object({ aceptaOnline: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // DOCTOR-only role check; the use case trusts this.
      if (ctx.session.user.role !== UserRole.DOCTOR) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo los doctores pueden modificar esta preferencia",
        });
      }

      // Resolve the doctor record for the session user.
      const doctorRecord = await db
        .select({ id: doctores.id })
        .from(doctores)
        .where(eq(doctores.usuarioId, ctx.session.user.id))
        .then((rows) => rows[0] ?? null);

      if (!doctorRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil de doctor no encontrado",
        });
      }

      const ipAddress =
        (ctx.headers?.["x-forwarded-for"] as string | undefined) ??
        (ctx.headers?.["x-real-ip"] as string | undefined) ??
        undefined;

      return updateAcceptsOnlineUseCase(db as never, {
        doctorId: doctorRecord.id,
        aceptaOnline: input.aceptaOnline,
        actorId: ctx.session.user.id,
        ipAddress,
      });
    }),

  getDoctorProfile: publicProcedure
    .input(
      z.object({
        doctorId: z.string().uuid("El ID del doctor no es válido"),
      }),
    )
    .query(async ({ input }) => {
      const doctorRow = await db
        .select()
        .from(doctores)
        .where(eq(doctores.id, input.doctorId))
        .then((rows) => rows[0] ?? null);

      if (!doctorRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      const user = await db
        .select({
          nombre: usuarios.nombre,
          email: usuarios.email,
        })
        .from(usuarios)
        .where(eq(usuarios.id, doctorRow.usuarioId))
        .then((rows) => rows[0] ?? null);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      const result: DoctorPublicResponse = {
        id: doctorRow.id,
        nombre: user.nombre,
        email: user.email,
        especialidad: doctorRow.especialidad,
        biografia: doctorRow.biografia,
        precioConsulta: toNumber(doctorRow.precioConsulta),
        calificacionMedia: toNumber(doctorRow.calificacionMedia),
        aceptaOnline: doctorRow.aceptaOnline,
      };

      return result;
    }),

  listDoctorProfiles: publicProcedure
    .input(
      z
        .object({
          especialidad: z.string().optional(),
          aceptaOnline: z.boolean().optional(),
          limit: z.number().min(1).max(50).default(20),
          offset: z.number().min(0).default(0),
        })
        .default({}),
    )
    .query(async ({ input }) => {
      const conditions = [eq(doctores.verificado, true)];

      if (input.especialidad) {
        conditions.push(
          ilike(doctores.especialidad, `%${input.especialidad}%`),
        );
      }

      if (input.aceptaOnline !== undefined) {
        conditions.push(eq(doctores.aceptaOnline, input.aceptaOnline));
      }

      const rows = await db
        .select({
          id: doctores.id,
          usuarioId: doctores.usuarioId,
          especialidad: doctores.especialidad,
          biografia: doctores.biografia,
          precioConsulta: doctores.precioConsulta,
          calificacionMedia: doctores.calificacionMedia,
          aceptaOnline: doctores.aceptaOnline,
          nombre: usuarios.nombre,
          email: usuarios.email,
        })
        .from(doctores)
        .innerJoin(usuarios, eq(doctores.usuarioId, usuarios.id))
        .where(and(...conditions))
        .limit(input.limit)
        .offset(input.offset);

      const results: DoctorPublicResponse[] = rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        email: row.email,
        especialidad: row.especialidad,
        biografia: row.biografia,
        precioConsulta: toNumber(row.precioConsulta),
        calificacionMedia: toNumber(row.calificacionMedia),
        aceptaOnline: row.aceptaOnline,
      }));

      return results;
    }),

  getDoctorFullProfile: publicProcedure
    .input(getDoctorFullProfileSchema)
    .query(async ({ input }) => {
      return getDoctorFullProfileUseCase(db as never, input.doctorId);
    }),

  getHomeStats: publicProcedure.query(async () => {
    // Safe fallback: trust counter is hidden when N === 0 (REQ-HOME-UI-3).
    // A DB outage MUST NOT 500 the landing page.
    try {
      return await getHomeStatsUseCase(db as never);
    } catch {
      return { totalVerifiedDoctors: 0, totalSpecialties: 0 };
    }
  }),

  getDoctorServices: publicProcedure
    .input(getDoctorServicesSchema)
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(doctorServicios)
        .where(
          and(
            eq(doctorServicios.doctorId, input.doctorId),
            eq(doctorServicios.activo, true),
          ),
        )
        .orderBy(asc(doctorServicios.orden))
        .then((rows) => rows);

      if (rows.length === 0) {
        // Verify doctor exists to return NOT_FOUND vs empty array
        const doctorExists = await db
          .select({ id: doctores.id })
          .from(doctores)
          .where(eq(doctores.id, input.doctorId))
          .then((rows) => rows[0] ?? null);

        if (!doctorExists) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Doctor no encontrado",
          });
        }
      }

      const results: DoctorServiceResponse[] = rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        descripcion: row.descripcion,
        precio: Number(row.precio),
        duracionMinutos: row.duracionMinutos,
        activo: row.activo,
        orden: row.orden,
      }));

      return results;
    }),
});
