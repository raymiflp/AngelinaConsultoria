import { TRPCError } from "@trpc/server";
import { eq, and, gte, like, count, sql, lte } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import { db } from "@/infrastructure/db";
import { usuarios, doctores, citas, pacientes } from "@/infrastructure/db/schema";
import { hash } from "@/infrastructure/auth/password";
import {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctoresSchema,
  getDoctorSchema,
  deleteDoctorSchema,
} from "@/infrastructure/admin/schemas";
import type {
  DoctorListItem,
  DoctorDetail,
  ListDoctoresResponse,
  DashboardStats,
} from "@/infrastructure/admin/schemas";

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Converts a Drizzle numeric column value (string | null) to number | null.
 */
function toNumber(val: string | null): number | null {
  if (val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Fetches a single doctor by its ID with linked Usuario fields.
 * Throws NOT_FOUND if the doctor does not exist.
 */
async function getDoctorById(
  doctorId: string,
): Promise<DoctorDetail | null> {
  const result = await db
    .select({
      id: doctores.id,
      usuarioId: doctores.usuarioId,
      numeroColegiado: doctores.numeroColegiado,
      especialidad: doctores.especialidad,
      biografia: doctores.biografia,
      precioConsulta: doctores.precioConsulta,
      verificado: doctores.verificado,
      calificacionMedia: doctores.calificacionMedia,
      nombre: usuarios.nombre,
      email: usuarios.email,
      telefono: usuarios.telefono,
      activo: usuarios.activo,
    })
    .from(doctores)
    .innerJoin(usuarios, eq(doctores.usuarioId, usuarios.id))
    .where(eq(doctores.id, doctorId))
    .then((rows) => rows[0] ?? null);

  if (!result) return null;

  return {
    ...result,
    precioConsulta: toNumber(result.precioConsulta),
    calificacionMedia: toNumber(result.calificacionMedia),
  };
}

/**
 * Check if a doctor has future appointments (non-cancelled, non-completed).
 */
async function hasFutureAppointments(doctorId: string): Promise<boolean> {
  const now = new Date();
  const future = await db
    .select({ id: citas.id })
    .from(citas)
    .where(
      and(
        eq(citas.doctorId, doctorId),
        gte(citas.fechaHora, now),
        sql`${citas.estado} NOT IN ('CANCELADA', 'COMPLETADA', 'NO_ASISTIO')`,
      ),
    )
    .limit(1)
    .then((rows) => rows.length > 0);

  return future;
}

// ─── Router ────────────────────────────────────────────────────────────

/**
 * Admin router — doctor CRUD and dashboard statistics.
 * All procedures require ADMIN role via adminProcedure.
 */
export const adminRouter = router({
  /**
   * getDashboardStats (admin, query)
   *
   * Returns aggregate metrics for the admin dashboard:
   * - Total doctors, patients, appointments
   * - Appointment breakdown by state
   * - Daily registrations (last 7 days)
   * - Ingresos (sum of completed appointment prices, last 30 days)
   */
  getDashboardStats: adminProcedure.query(async (): Promise<DashboardStats> => {
    const [totalDoctores] = await db
      .select({ count: count() })
      .from(doctores);

    const [totalPacientes] = await db
      .select({ count: count() })
      .from(pacientes);

    const [totalCitas] = await db
      .select({ count: count() })
      .from(citas);

    // Citas por estado
    const citasPorEstadoRaw = await db
      .select({
        estado: citas.estado,
        count: count(),
      })
      .from(citas)
      .groupBy(citas.estado);

    const citasPorEstado: Record<string, number> = {};
    for (const row of citasPorEstadoRaw) {
      citasPorEstado[row.estado] = row.count;
    }

    // Registros diarios (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const registrosDiariosRaw = await db
      .select({
        fecha: sql<string>`DATE(${usuarios.createdAt})`,
        count: count(),
      })
      .from(usuarios)
      .where(gte(usuarios.createdAt, sevenDaysAgo))
      .groupBy(sql`DATE(${usuarios.createdAt})`)
      .orderBy(sql`DATE(${usuarios.createdAt})`);

    const registrosDiarios = registrosDiariosRaw.map((r) => ({
      fecha: r.fecha,
      count: r.count,
    }));

    // Ingresos (sum of precio for COMPLETADA citas, last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [ingresosResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${citas.precio} AS DECIMAL)), 0)`,
      })
      .from(citas)
      .where(
        and(
          eq(citas.estado, "COMPLETADA"),
          gte(citas.fechaHora, thirtyDaysAgo),
        ),
      );

    return {
      totalDoctores: totalDoctores?.count ?? 0,
      totalPacientes: totalPacientes?.count ?? 0,
      totalCitas: totalCitas?.count ?? 0,
      citasPorEstado,
      registrosDiarios,
      ingresos: Number(ingresosResult?.total ?? 0),
    };
  }),

  /**
   * listDoctores (admin, query)
   *
   * Paginated list of doctors with optional search by nombre or especialidad.
   */
  listDoctores: adminProcedure
    .input(listDoctoresSchema)
    .query(async ({ input }): Promise<ListDoctoresResponse> => {
      const { busqueda, pagina, limite } = input;
      const offset = (pagina - 1) * limite;

      // Build search condition
      const conditions = [];
      if (busqueda && busqueda.trim().length > 0) {
        const pattern = `%${busqueda.trim()}%`;
        conditions.push(
          sql`(${usuarios.nombre} ILIKE ${pattern} OR ${doctores.especialidad} ILIKE ${pattern})`,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(doctores)
        .innerJoin(usuarios, eq(doctores.usuarioId, usuarios.id))
        .where(whereClause);

      const total = totalResult?.count ?? 0;

      // Get paginated rows
      const rows = await db
        .select({
          id: doctores.id,
          usuarioId: doctores.usuarioId,
          numeroColegiado: doctores.numeroColegiado,
          especialidad: doctores.especialidad,
          biografia: doctores.biografia,
          precioConsulta: doctores.precioConsulta,
          verificado: doctores.verificado,
          nombre: usuarios.nombre,
          email: usuarios.email,
          telefono: usuarios.telefono,
          activo: usuarios.activo,
        })
        .from(doctores)
        .innerJoin(usuarios, eq(doctores.usuarioId, usuarios.id))
        .where(whereClause)
        .orderBy(usuarios.nombre)
        .limit(limite)
        .offset(offset);

      return {
        doctores: rows.map((r) => ({
          ...r,
          precioConsulta: toNumber(r.precioConsulta),
        })),
        total,
        pagina,
        totalPaginas: Math.ceil(total / limite),
      };
    }),

  /**
   * getDoctor (admin, query)
   *
   * Returns a single doctor with full detail including Usuario fields.
   * Throws NOT_FOUND if the doctor does not exist.
   */
  getDoctor: adminProcedure
    .input(getDoctorSchema)
    .query(async ({ input }): Promise<DoctorDetail> => {
      const doctor = await getDoctorById(input.doctorId);

      if (!doctor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      return doctor;
    }),

  /**
   * createDoctor (admin, mutation)
   *
   * Creates a new doctor with linked Usuario in a single transaction.
   * Checks for duplicate email and numeroColegiado.
   */
  createDoctor: adminProcedure
    .input(createDoctorSchema)
    .mutation(async ({ input }): Promise<DoctorDetail> => {
      const {
        email,
        password,
        nombre,
        telefono,
        numeroColegiado,
        especialidad,
        precioConsulta,
        biografia,
        verificado,
      } = input;

      // Check duplicate email
      const existingUser = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.email, email.toLowerCase().trim()))
        .then((rows) => rows[0] ?? null);

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "El email ya está registrado",
        });
      }

      // Check duplicate numeroColegiado
      const existingDoctor = await db
        .select({ id: doctores.id })
        .from(doctores)
        .where(eq(doctores.numeroColegiado, numeroColegiado))
        .then((rows) => rows[0] ?? null);

      if (existingDoctor) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "El número de colegiado ya está registrado",
        });
      }

      // Transaction: create usuario + doctor
      const result = await db.transaction(async (tx) => {
        const passwordHash = await hash(password);

        const [newUser] = await tx
          .insert(usuarios)
          .values({
            email: email.toLowerCase().trim(),
            passwordHash,
            rol: "DOCTOR",
            nombre,
            telefono: telefono || "",
          })
          .returning();

        if (!newUser) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el usuario",
          });
        }

        const [newDoctor] = await tx
          .insert(doctores)
          .values({
            usuarioId: newUser.id,
            numeroColegiado,
            especialidad,
            biografia: biografia ?? null,
            precioConsulta: precioConsulta != null ? String(precioConsulta) : null,
            verificado: verificado ?? false,
          })
          .returning();

        if (!newDoctor) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el doctor",
          });
        }

        return {
          id: newDoctor.id,
          usuarioId: newUser.id,
          numeroColegiado: newDoctor.numeroColegiado,
          especialidad: newDoctor.especialidad,
          biografia: newDoctor.biografia,
          precioConsulta: toNumber(newDoctor.precioConsulta),
          verificado: newDoctor.verificado,
          calificacionMedia: null,
          nombre: newUser.nombre,
          email: newUser.email,
          telefono: newUser.telefono,
          activo: newUser.activo,
        };
      });

      return result;
    }),

  /**
   * updateDoctor (admin, mutation)
   *
   * Updates an existing doctor's fields and optionally Usuario fields.
   * Cannot change email or role.
   */
  updateDoctor: adminProcedure
    .input(updateDoctorSchema)
    .mutation(async ({ input }): Promise<DoctorDetail> => {
      const {
        doctorId,
        nombre,
        telefono,
        numeroColegiado,
        especialidad,
        precioConsulta,
        biografia,
        verificado,
      } = input;

      // Verify doctor exists
      const existing = await db
        .select()
        .from(doctores)
        .where(eq(doctores.id, doctorId))
        .then((rows) => rows[0] ?? null);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      // Check duplicate numeroColegiado if provided
      if (numeroColegiado && numeroColegiado !== existing.numeroColegiado) {
        const dup = await db
          .select({ id: doctores.id })
          .from(doctores)
          .where(
            and(
              eq(doctores.numeroColegiado, numeroColegiado),
              sql`${doctores.id} != ${doctorId}::uuid`,
            ),
          )
          .then((rows) => rows[0] ?? null);

        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "El número de colegiado ya está registrado por otro doctor",
          });
        }
      }

      // Transaction: update usuario + doctor
      const result = await db.transaction(async (tx) => {
        // Update Usuario fields if provided
        if (nombre !== undefined || telefono !== undefined) {
          const usuarioUpdates: Record<string, unknown> = {};
          if (nombre !== undefined) usuarioUpdates.nombre = nombre;
          if (telefono !== undefined) usuarioUpdates.telefono = telefono;

          await tx
            .update(usuarios)
            .set(usuarioUpdates)
            .where(eq(usuarios.id, existing.usuarioId));
        }

        // Update Doctor fields
        const doctorUpdates: Record<string, unknown> = {};
        if (numeroColegiado !== undefined) doctorUpdates.numeroColegiado = numeroColegiado;
        if (especialidad !== undefined) doctorUpdates.especialidad = especialidad;
        if (biografia !== undefined) doctorUpdates.biografia = biografia;
        if (precioConsulta !== undefined) {
          doctorUpdates.precioConsulta = String(precioConsulta);
        }
        if (verificado !== undefined) doctorUpdates.verificado = verificado;

        if (Object.keys(doctorUpdates).length > 0) {
          await tx
            .update(doctores)
            .set(doctorUpdates)
            .where(eq(doctores.id, doctorId));
        }

        // Return updated doctor
        const updated = await getDoctorById(doctorId);
        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al actualizar el doctor",
          });
        }

        return updated;
      });

      return result;
    }),

  /**
   * deleteDoctor (admin, mutation)
   *
   * Soft deletes (sets activo=false) or hard deletes a doctor.
   * Rejects if the doctor has future appointments.
   */
  deleteDoctor: adminProcedure
    .input(deleteDoctorSchema)
    .mutation(async ({ input }) => {
      const { doctorId, tipo } = input;

      // Verify doctor exists
      const existing = await db
        .select()
        .from(doctores)
        .where(eq(doctores.id, doctorId))
        .then((rows) => rows[0] ?? null);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      // Check future appointments
      const hasFuture = await hasFutureAppointments(doctorId);
      if (hasFuture) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No se puede eliminar el doctor porque tiene citas futuras programadas",
        });
      }

      if (tipo === "hard") {
        // Hard delete: remove both rows in transaction
        await db.transaction(async (tx) => {
          await tx.delete(doctores).where(eq(doctores.id, doctorId));
          await tx.delete(usuarios).where(eq(usuarios.id, existing.usuarioId));
        });
      } else {
        // Soft delete: mark usuario as inactive
        // NOTE: doctores table has no `activo` column — only usuarios has it.
        await db
          .update(usuarios)
          .set({ activo: false })
          .where(eq(usuarios.id, existing.usuarioId));
      }

      return { ok: true as const };
    }),
});
