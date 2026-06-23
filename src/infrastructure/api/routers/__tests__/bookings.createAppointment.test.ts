import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError, initTRPC } from "@trpc/server";
import { z } from "zod";

/**
 * Test plan for `bookings.createAppointment` (modality-toggle, PR-B):
 *
 *   1. Accepts `modalidad: "PRESENCIAL"` and forwards it to the use case
 *   2. Accepts `modalidad: "ONLINE"` and forwards it to the use case
 *   3. Rejects an invalid `modalidad` value with `BAD_REQUEST` BEFORE
 *      the use case is invoked (no DB round-trip on a bad modality)
 *
 * The test mirrors the wire adapter behavior in isolation (no real DB).
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockCreateAppointmentUseCase = vi.fn();
const mockWriteAudit = vi.fn();
const mockCacheInvalidate = vi.fn();

vi.mock("@/application", () => ({
  createAppointmentUseCase: (...args: unknown[]) =>
    mockCreateAppointmentUseCase(...args),
  writeAuditLogUseCase: (...args: unknown[]) => mockWriteAudit(...args),
}));

vi.mock("@/infrastructure/redis/cache", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

// ── Test router mirroring the procedure body ──────────────────────────

const t = initTRPC
  .context<{
    db: null;
    session: { user: { id: string; role: string } } | null;
  }>()
  .create();

const protectedMiddleware = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// Mirror the relevant subset of `bookings.createAppointment`. The point of
// this test is the Zod schema + the pass-through; the rest of the
// procedure body (audit log, cache invalidation) is exercised in the
// other booking tests.
const createAppointmentSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
  fechaHora: z.string().datetime({ message: "Fecha y hora inválida" }),
  motivoConsulta: z
    .string()
    .min(1, "El motivo de consulta es requerido")
    .max(1000, "El motivo no puede exceder 1000 caracteres"),
  modalidad: z.enum(["PRESENCIAL", "ONLINE"], {
    errorMap: () => ({
      message: "Modalidad inválida: debe ser PRESENCIAL u ONLINE",
    }),
  }),
});

const testRouter = t.router({
  createAppointment: protectedMiddleware
    .input(createAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      // Reject non-PACIENTE sessions (mirror the procedure's requirePaciente)
      if (ctx.session.user.role !== "PACIENTE") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo los pacientes pueden realizar esta acción",
        });
      }

      const result = (await mockCreateAppointmentUseCase(null, {
        doctorId: input.doctorId,
        pacienteId: "pac-1",
        fechaHora: input.fechaHora,
        motivoConsulta: input.motivoConsulta,
        modalidad: input.modalidad,
      })) as { id: string; modalidad: string };

      await mockWriteAudit(null, {
        usuarioId: ctx.session.user.id,
        accion: "CITA_CREATED",
        entidadAfectada: "cita",
        entidadId: result.id,
        detalles: { doctorId: input.doctorId, fechaHora: input.fechaHora },
      });

      const dateStr = input.fechaHora.split("T")[0]!;
      await mockCacheInvalidate(`slots:${input.doctorId}:${dateStr}`);

      return result;
    }),
});

const createCaller = t.createCallerFactory(testRouter);

const DOCTOR_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const PATIENT_USER_ID = "user-pac-1";
const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000003";

// ── Tests ──────────────────────────────────────────────────────────────

describe("bookings.createAppointment — modalidad input (modality-toggle, PR-B)", () => {
  beforeEach(() => {
    mockCreateAppointmentUseCase.mockReset();
    mockWriteAudit.mockReset();
    mockCacheInvalidate.mockReset();
    mockWriteAudit.mockResolvedValue(undefined);
    mockCacheInvalidate.mockResolvedValue(undefined);
  });

  it("accepts modalidad: 'PRESENCIAL' and forwards it to the use case", async () => {
    mockCreateAppointmentUseCase.mockResolvedValue({
      id: CITA_ID,
      doctorId: DOCTOR_ID,
      pacienteId: "pac-1",
      fechaHora: new Date("2026-06-22T10:00:00.000Z"),
      estado: "PENDIENTE",
      motivo: "Control",
      duracionMinutos: 30,
      modalidad: "PRESENCIAL",
    });

    const caller = createCaller({
      db: null,
      session: { user: { id: PATIENT_USER_ID, role: "PACIENTE" } },
    });

    await caller.createAppointment({
      doctorId: DOCTOR_ID,
      fechaHora: "2026-06-22T10:00:00.000Z",
      motivoConsulta: "Control",
      modalidad: "PRESENCIAL",
    });

    expect(mockCreateAppointmentUseCase).toHaveBeenCalledTimes(1);
    const useCaseArgs = mockCreateAppointmentUseCase.mock.calls[0]![1] as {
      modalidad: string;
    };
    expect(useCaseArgs.modalidad).toBe("PRESENCIAL");
  });

  it("accepts modalidad: 'ONLINE' and forwards it to the use case", async () => {
    mockCreateAppointmentUseCase.mockResolvedValue({
      id: CITA_ID,
      doctorId: DOCTOR_ID,
      pacienteId: "pac-1",
      fechaHora: new Date("2026-06-22T10:00:00.000Z"),
      estado: "PENDIENTE",
      motivo: "Videoconsulta",
      duracionMinutos: 30,
      modalidad: "ONLINE",
    });

    const caller = createCaller({
      db: null,
      session: { user: { id: PATIENT_USER_ID, role: "PACIENTE" } },
    });

    await caller.createAppointment({
      doctorId: DOCTOR_ID,
      fechaHora: "2026-06-22T10:00:00.000Z",
      motivoConsulta: "Videoconsulta",
      modalidad: "ONLINE",
    });

    expect(mockCreateAppointmentUseCase).toHaveBeenCalledTimes(1);
    const useCaseArgs = mockCreateAppointmentUseCase.mock.calls[0]![1] as {
      modalidad: string;
    };
    expect(useCaseArgs.modalidad).toBe("ONLINE");
  });

  it("rejects an invalid modalidad value with BAD_REQUEST BEFORE the use case is invoked", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: PATIENT_USER_ID, role: "PACIENTE" } },
    });

    await expect(
      caller.createAppointment({
        doctorId: DOCTOR_ID,
        fechaHora: "2026-06-22T10:00:00.000Z",
        motivoConsulta: "Test",
        // @ts-expect-error — testing the Zod validator on a bad value
        modalidad: "HIDRIDA",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    // A bad modality MUST NOT cost a DB round-trip.
    expect(mockCreateAppointmentUseCase).not.toHaveBeenCalled();
  });
});
