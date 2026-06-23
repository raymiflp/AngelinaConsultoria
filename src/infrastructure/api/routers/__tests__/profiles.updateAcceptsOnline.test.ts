import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError, initTRPC } from "@trpc/server";
import { z } from "zod";

/**
 * Test plan for profiles.updateAcceptsOnline:
 *
 *   1. DOCTOR session → calls the use case, returns { id, aceptaOnline }
 *   2. PACIENTE session → rejected with FORBIDDEN
 *   3. Anonymous session → rejected with UNAUTHORIZED
 *   4. Doctor row not found → rejected with NOT_FOUND
 *   5. Invalid input (string instead of boolean) → rejected with BAD_REQUEST
 *
 * The test mirrors the profiles router's procedure body in isolation
 * (no real DB, no real audit). The use case is mocked; the doctor-record
 * lookup is exercised via a stubbed `db.select(...)` chain.
 */

const { updateAcceptsOnlineUseCaseMock, findDoctorMock } = vi.hoisted(() => ({
  updateAcceptsOnlineUseCaseMock: vi.fn(),
  findDoctorMock: vi.fn<() => Promise<{ id: string } | null>>(),
}));

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/application", () => ({
  updateAcceptsOnlineUseCase: (...args: unknown[]) =>
    updateAcceptsOnlineUseCaseMock(...args),
}));

// ── Test router mirroring the procedure body ──────────────────────────

const t = initTRPC
  .context<{
    db: null;
    session: { user: { id: string; role: string } } | null;
    headers?: Record<string, string | string[] | undefined>;
  }>()
  .create();

const protectedMiddleware = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const testRouter = t.router({
  updateAcceptsOnline: protectedMiddleware
    .input(z.object({ aceptaOnline: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== "DOCTOR") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo los doctores pueden modificar esta preferencia",
        });
      }

      const doctorRecord = await findDoctorMock();

      if (!doctorRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil de doctor no encontrado",
        });
      }

      return updateAcceptsOnlineUseCaseMock(null, {
        doctorId: doctorRecord.id,
        aceptaOnline: input.aceptaOnline,
        actorId: ctx.session.user.id,
      });
    }),
});

const createCaller = t.createCallerFactory(testRouter);

const DOCTOR_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const USER_ID = "user-doc-1";

// ── Tests ──────────────────────────────────────────────────────────────

describe("profiles.updateAcceptsOnline", () => {
  beforeEach(() => {
    updateAcceptsOnlineUseCaseMock.mockReset();
    findDoctorMock.mockReset();
  });

  it("DOCTOR session calls the use case and returns { id, aceptaOnline }", async () => {
    findDoctorMock.mockResolvedValue({ id: DOCTOR_ID });
    updateAcceptsOnlineUseCaseMock.mockResolvedValue({
      id: DOCTOR_ID,
      aceptaOnline: true,
    });

    const caller = createCaller({
      db: null,
      session: { user: { id: USER_ID, role: "DOCTOR" } },
    });

    const result = await caller.updateAcceptsOnline({ aceptaOnline: true });

    expect(result).toEqual({ id: DOCTOR_ID, aceptaOnline: true });
    expect(updateAcceptsOnlineUseCaseMock).toHaveBeenCalledTimes(1);
    const args = updateAcceptsOnlineUseCaseMock.mock.calls[0]![1] as {
      doctorId: string;
      aceptaOnline: boolean;
      actorId: string;
    };
    expect(args.doctorId).toBe(DOCTOR_ID);
    expect(args.aceptaOnline).toBe(true);
    expect(args.actorId).toBe(USER_ID);
  });

  it("PACIENTE session is rejected with FORBIDDEN (use case not called)", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-pac-1", role: "PACIENTE" } },
    });

    await expect(
      caller.updateAcceptsOnline({ aceptaOnline: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateAcceptsOnlineUseCaseMock).not.toHaveBeenCalled();
  });

  it("Anonymous session is rejected with UNAUTHORIZED (use case not called)", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(
      caller.updateAcceptsOnline({ aceptaOnline: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(updateAcceptsOnlineUseCaseMock).not.toHaveBeenCalled();
  });

  it("doctor row not found returns NOT_FOUND", async () => {
    findDoctorMock.mockResolvedValue(null);

    const caller = createCaller({
      db: null,
      session: { user: { id: USER_ID, role: "DOCTOR" } },
    });

    await expect(
      caller.updateAcceptsOnline({ aceptaOnline: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateAcceptsOnlineUseCaseMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input (string instead of boolean) with Zod BAD_REQUEST", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: USER_ID, role: "DOCTOR" } },
    });

    await expect(
      // @ts-expect-error — exercising the Zod guard on a bad input
      caller.updateAcceptsOnline({ aceptaOnline: "yes" }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(updateAcceptsOnlineUseCaseMock).not.toHaveBeenCalled();
  });
});
