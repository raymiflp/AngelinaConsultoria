import { TRPCError } from "@trpc/server";
import { eq, and, gte, lt, ne, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { publicProcedure, protectedProcedure, rateLimitedPublicProcedure, router } from "../trpc";
import { db } from "@/infrastructure/db";
import { citas, doctores, pacientes, doctorDisponibilidad, usuarios } from "@/infrastructure/db/schema";
import { ConsultationStatus, transitionStatus, UserRole } from "@/domain/enums";
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  updateStatusSchema,
  updateNotesSchema,
  dateSchema,
} from "@/infrastructure/booking/schemas";
import { getDayName, formatHHMM, generateSlots } from "@/infrastructure/booking/slot-utils";
import type { Slot } from "@/infrastructure/booking/slot-utils";
import {
  createAppointmentUseCase,
  cancelAppointmentUseCase,
  updateAppointmentStatusUseCase,
  getMyPatientsUseCase,
  getMyAppointmentsUseCase,
  getDoctorSlotsUseCase,
  getRoomTokenUseCase,
  writeAuditLogUseCase,
} from "@/application";
import { cacheGetOrSet, cacheInvalidate } from "@/infrastructure/redis/cache";

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Resolve the doctor DB record that belongs to the authenticated user.
 */
async function findDoctorByUserId(userId: string) {
  return db
    .select()
    .from(doctores)
    .where(eq(doctores.usuarioId, userId))
    .then((rows) => rows[0] ?? null);
}

/**
 * Resolve the patient DB record that belongs to the authenticated user.
 */
async function findPacienteByUserId(userId: string) {
  return db
    .select()
    .from(pacientes)
    .where(eq(pacientes.usuarioId, userId))
    .then((rows) => rows[0] ?? null);
}

/**
 * Ensures the authenticated user is a DOCTOR.
 */
function requireDoctor(ctx: { session: { user: { role: string } } }) {
  if (ctx.session.user.role !== UserRole.DOCTOR) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los doctores pueden realizar esta acción",
    });
  }
}

/**
 * Ensures the authenticated user is a PACIENTE.
 */
function requirePaciente(ctx: { session: { user: { role: string } } }) {
  if (ctx.session.user.role !== UserRole.PACIENTE) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los pacientes pueden realizar esta acción",
    });
  }
}

// ── Table aliases for self-joining usuarios ───────────────────────────

const doctorUserAlias = alias(usuarios, "doctor_user");
const pacienteUserAlias = alias(usuarios, "paciente_user");

// ── Router ─────────────────────────────────────────────────────────────

export const bookingsRouter = router({
  // ── Public procedures ───────────────────────────────────────────────

  getDoctorSlots: rateLimitedPublicProcedure
    .input(dateSchema)
    .query(async ({ input }): Promise<Slot[]> => {
      const cacheKey = `slots:${input.doctorId}:${input.date}`;
      return cacheGetOrSet(cacheKey, () => getDoctorSlotsUseCase(db as never, input), 30);
    }),

  getDoctorAvailability: publicProcedure
    .input(z.object({ doctorId: z.string().uuid("ID de doctor inválido") }))
    .query(async ({ input }) => {
      const availability = await db
        .select()
        .from(doctorDisponibilidad)
        .where(eq(doctorDisponibilidad.doctorId, input.doctorId))
        .then((rows) => rows[0] ?? null);

      if (!availability) return { availableDays: [] as string[] };

      const disponibilidad = availability.disponibilidad as Record<
        string,
        Array<{ inicio: string; fin: string }>
      >;

      const availableDays = Object.keys(disponibilidad).filter(
        (day) => disponibilidad[day] && disponibilidad[day]!.length > 0,
      );

      return { availableDays };
    }),

  // ── Protected procedures ────────────────────────────────────────────

  getMyAppointments: protectedProcedure
    .input(
      z.object({
        estado: z.nativeEnum(ConsultationStatus).optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const role = ctx.session.user.role;

      let doctorId: string | undefined;
      let pacienteId: string | undefined;

      if (role === UserRole.DOCTOR) {
        const doctorRecord = await findDoctorByUserId(userId);
        if (!doctorRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Perfil de doctor no encontrado",
          });
        }
        doctorId = doctorRecord.id;
      } else {
        const pacienteRecord = await findPacienteByUserId(userId);
        if (!pacienteRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Perfil de paciente no encontrado",
          });
        }
        pacienteId = pacienteRecord.id;
      }

      return getMyAppointmentsUseCase(db as never, {
        doctorId,
        pacienteId,
        estado: input.estado,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getMyPatients: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      requireDoctor(ctx);

      const userId = ctx.session.user.id;
      const doctorRecord = await findDoctorByUserId(userId);
      if (!doctorRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil de doctor no encontrado",
        });
      }

      return getMyPatientsUseCase(db as never, {
        doctorId: doctorRecord.id,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  createAppointment: protectedProcedure
    .input(createAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      requirePaciente(ctx);

      const userId = ctx.session.user.id;
      const pacienteRecord = await findPacienteByUserId(userId);
      if (!pacienteRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil de paciente no encontrado",
        });
      }

      const result = await createAppointmentUseCase(db as never, {
        doctorId: input.doctorId,
        pacienteId: pacienteRecord.id,
        fechaHora: input.fechaHora,
        motivoConsulta: input.motivoConsulta,
        modalidad: input.modalidad,
      });

      // Audit log
      await writeAuditLogUseCase(db as never, {
        usuarioId: userId,
        accion: "CITA_CREATED",
        entidadAfectada: "cita",
        entidadId: result.id,
        detalles: {
          doctorId: input.doctorId,
          fechaHora: input.fechaHora,
        },
      });

      // Invalidate slot cache for this doctor
      const dateStr = input.fechaHora.split("T")[0]!;
      await cacheInvalidate(`slots:${input.doctorId}:${dateStr}`);

      return result;
    }),

  cancelAppointment: protectedProcedure
    .input(cancelAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const role = ctx.session.user.role;

      let actorPacienteId: string | undefined;
      let actorDoctorId: string | undefined;

      if (role === UserRole.PACIENTE) {
        const pacienteRecord = await findPacienteByUserId(userId);
        if (!pacienteRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Perfil de paciente no encontrado",
          });
        }
        actorPacienteId = pacienteRecord.id;
      } else if (role === UserRole.DOCTOR) {
        const doctorRecord = await findDoctorByUserId(userId);
        if (!doctorRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Perfil de doctor no encontrado",
          });
        }
        actorDoctorId = doctorRecord.id;
      } else {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No tienes permiso para cancelar citas",
        });
      }

      const result = await cancelAppointmentUseCase(
        db as never,
        { citaId: input.citaId },
        { pacienteId: actorPacienteId, doctorId: actorDoctorId },
      );

      // Audit log
      await writeAuditLogUseCase(db as never, {
        usuarioId: userId,
        accion: "CITA_CANCELLED",
        entidadAfectada: "cita",
        entidadId: input.citaId,
        detalles: { motivo: input.motivo ?? null },
      });

      // Invalidate slot cache for this doctor
      if (actorDoctorId) {
        await cacheInvalidate(`slots:${actorDoctorId}:*`);
      }

      return result;
    }),

  updateAppointmentStatus: protectedProcedure
    .input(updateStatusSchema)
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

      const result = await updateAppointmentStatusUseCase(db as never, {
        citaId: input.citaId,
        doctorId: doctorRecord.id,
        nuevoEstado: input.nuevoEstado,
      });

      // Audit log
      await writeAuditLogUseCase(db as never, {
        usuarioId: userId,
        accion: "CITA_STATUS_CHANGED",
        entidadAfectada: "cita",
        entidadId: input.citaId,
        detalles: {
          estadoAnterior: result.estado,
          estadoNuevo: input.nuevoEstado,
        },
      });

      return result;
    }),

  updateAppointmentNotes: protectedProcedure
    .input(updateNotesSchema)
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

      const cita = await db
        .select()
        .from(citas)
        .where(eq(citas.id, input.citaId))
        .then((rows) => rows[0] ?? null);

      if (!cita) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cita no encontrada",
        });
      }

      if (cita.doctorId !== doctorRecord.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes modificar las notas de una cita de otro doctor",
        });
      }

      await db
        .update(citas)
        .set({ notas: input.notas })
        .where(eq(citas.id, input.citaId));

      // Audit log
      await writeAuditLogUseCase(db as never, {
        usuarioId: userId,
        accion: "CITA_NOTES_UPDATED",
        entidadAfectada: "cita",
        entidadId: input.citaId,
        detalles: { notasLength: input.notas.length },
      });

      return { ok: true as const };
    }),

  // ── Video calls (AD-1: appended to bookings router, NOT a new videoCallsRouter) ──

  getRoomToken: protectedProcedure
    .input(z.object({ citaId: z.string().uuid() }))
    .output(
      z.object({
        token: z.string().min(1),
        serverUrl: z.string().url(),
        roomName: z.string().regex(/^cita-[0-9a-f-]{36}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await getRoomTokenUseCase(db as never, {
        citaId: input.citaId,
        actor: {
          id: ctx.session!.user.id,
          role: ctx.session!.user.role as UserRole,
        },
      });

      // AD-10: audit detalles are { roomName, role } ONLY — the token MUST NOT flow here.
      // AD-12: best-effort — an audit write failure logs a warning and does NOT fail the call.
      try {
        await writeAuditLogUseCase(db as never, {
          usuarioId: ctx.session!.user.id,
          accion: "CITA_ROOM_TOKEN_ISSUED",
          entidadAfectada: "citas",
          entidadId: input.citaId,
          detalles: { roomName: result.roomName, role: ctx.session!.user.role },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[getRoomToken] audit log failed for citaId=${input.citaId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      return result;
    }),
});
