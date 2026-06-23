import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError, initTRPC } from "@trpc/server";
import { z } from "zod";

/**
 * Test plan for the getRoomToken procedure:
 *
 *   1. Anonymous request → UNAUTHORIZED (no use case call, no audit).
 *   2. Authenticated participant → returns the shape and writes ONE audit row.
 *      - Audit detalles has { roomName, role } and does NOT contain "token".
 *   3. Authenticated participant, but the use case throws NOT_FOUND (non-participant
 *      or non-existent cita) → NOT_FOUND bubbles, NO audit row.
 *   4. Authenticated participant, PENDIENTE → FORBIDDEN with Spanish message,
 *      NO audit row.
 *   5. Audit write throws → procedure STILL returns the token (best-effort).
 *
 * The test mirrors the bookings router's wire adapter behavior in isolation
 * (no real DB, no real LiveKit).
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockUseCase = vi.fn();
const mockWriteAudit = vi.fn();

vi.mock("@/application", () => ({
  getRoomTokenUseCase: (...args: unknown[]) => mockUseCase(...args),
  writeAuditLogUseCase: (...args: unknown[]) => mockWriteAudit(...args),
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

const testRouter = t.router({
  getRoomToken: protectedMiddleware
    .input(z.object({ citaId: z.string().uuid() }))
    .output(
      z.object({
        token: z.string().min(1),
        serverUrl: z.string().url(),
        roomName: z.string().regex(/^cita-[0-9a-f-]{36}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = (await mockUseCase(null, {
        citaId: input.citaId,
        actor: { id: ctx.session.user.id, role: ctx.session.user.role },
      })) as { token: string; serverUrl: string; roomName: string };

      try {
        await mockWriteAudit(null, {
          usuarioId: ctx.session.user.id,
          accion: "CITA_ROOM_TOKEN_ISSUED",
          entidadAfectada: "citas",
          entidadId: input.citaId,
          detalles: { roomName: result.roomName, role: ctx.session.user.role },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[getRoomToken] audit log failed:", err);
      }

      return result;
    }),
});

const createCaller = t.createCallerFactory(testRouter);

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";

// ── Tests ──────────────────────────────────────────────────────────────

describe("bookings.getRoomToken", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockUseCase.mockReset();
    mockWriteAudit.mockReset();
    mockWriteAudit.mockResolvedValue(undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* swallow */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("rejects anonymous requests with UNAUTHORIZED (no use case call, no audit)", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(caller.getRoomToken({ citaId: CITA_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mockUseCase).not.toHaveBeenCalled();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("returns the shape and writes ONE audit row on success (doctor participant)", async () => {
    mockUseCase.mockResolvedValue({
      token: "jwt-fixture",
      serverUrl: "ws://localhost:7880",
      roomName: `cita-${CITA_ID}`,
    });

    const caller = createCaller({
      db: null,
      session: { user: { id: "user-doc-1", role: "DOCTOR" } },
    });

    const result = await caller.getRoomToken({ citaId: CITA_ID });

    expect(result).toEqual({
      token: "jwt-fixture",
      serverUrl: "ws://localhost:7880",
      roomName: `cita-${CITA_ID}`,
    });

    expect(mockUseCase).toHaveBeenCalledWith(null, {
      citaId: CITA_ID,
      actor: { id: "user-doc-1", role: "DOCTOR" },
    });

    expect(mockWriteAudit).toHaveBeenCalledTimes(1);
    const auditArgs = mockWriteAudit.mock.calls[0]![1] as {
      usuarioId: string;
      accion: string;
      entidadAfectada: string;
      entidadId: string;
      detalles: Record<string, unknown>;
    };
    expect(auditArgs.accion).toBe("CITA_ROOM_TOKEN_ISSUED");
    expect(auditArgs.entidadAfectada).toBe("citas");
    expect(auditArgs.entidadId).toBe(CITA_ID);
    expect(auditArgs.usuarioId).toBe("user-doc-1");
    // AD-10: detalles MUST contain { roomName, role } and MUST NOT contain a "token" field.
    expect(auditArgs.detalles).toEqual({
      roomName: `cita-${CITA_ID}`,
      role: "DOCTOR",
    });
    expect(auditArgs.detalles).not.toHaveProperty("token");
    // No substring leak either.
    expect(JSON.stringify(auditArgs.detalles)).not.toContain("jwt-fixture");
  });

  it("returns NOT_FOUND for a non-participant and does NOT write an audit row", async () => {
    mockUseCase.mockRejectedValue(new TRPCError({ code: "NOT_FOUND" }));

    const caller = createCaller({
      db: null,
      session: { user: { id: "user-stranger", role: "DOCTOR" } },
    });

    await expect(caller.getRoomToken({ citaId: CITA_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUseCase).toHaveBeenCalledTimes(1);
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN with the PENDIENTE Spanish message and does NOT write an audit row", async () => {
    mockUseCase.mockRejectedValue(
      new TRPCError({
        code: "FORBIDDEN",
        message: "La cita debe estar confirmada antes de unirse a la videollamada.",
      }),
    );

    const caller = createCaller({
      db: null,
      session: { user: { id: "user-pac-1", role: "PACIENTE" } },
    });

    await expect(caller.getRoomToken({ citaId: CITA_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "La cita debe estar confirmada antes de unirse a la videollamada.",
    });
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("best-effort: audit throw does NOT fail the procedure (token still returned, warning logged)", async () => {
    mockUseCase.mockResolvedValue({
      token: "jwt-fixture",
      serverUrl: "ws://localhost:7880",
      roomName: `cita-${CITA_ID}`,
    });
    mockWriteAudit.mockRejectedValue(new Error("audit DB down"));

    const caller = createCaller({
      db: null,
      session: { user: { id: "user-doc-1", role: "DOCTOR" } },
    });

    const result = await caller.getRoomToken({ citaId: CITA_ID });

    // Procedure still resolves with the token — the call succeeds.
    expect(result.token).toBe("jwt-fixture");
    expect(result.roomName).toBe(`cita-${CITA_ID}`);

    // The warning was logged.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArgs = warnSpy.mock.calls[0]!;
    expect(String(warnArgs[0])).toContain("[getRoomToken] audit log failed");
  });

  // ── modality-toggle (PR-B) — D6 / D13 regression guard at the procedure level ──

  it("PRESENCIAL cita at the procedure level: surfaces the modality-specific FORBIDDEN and does NOT write an audit row", async () => {
    // The use case has already rejected the PRESENCIAL cita with the
    // modality-specific FORBIDDEN message (per D6). The procedure re-
    // surfaces the error verbatim and MUST NOT write the audit row.
    mockUseCase.mockRejectedValue(
      new TRPCError({
        code: "FORBIDDEN",
        message: "Esta cita es presencial, no permite videollamada",
      }),
    );

    const caller = createCaller({
      db: null,
      session: { user: { id: "user-pac-1", role: "PACIENTE" } },
    });

    await expect(caller.getRoomToken({ citaId: CITA_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita es presencial, no permite videollamada",
    });
    expect(mockUseCase).toHaveBeenCalledTimes(1);
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });
});
