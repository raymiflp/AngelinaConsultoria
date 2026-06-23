import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WebhookEvent } from "livekit-server-sdk";

import { autoCompleteOnRoomFinishedUseCase } from "@/application/use-cases/bookings/auto-complete-on-room-finished.use-case";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";
import * as schema from "@/infrastructure/db/schema";

/**
 * Mock the audit write BEFORE importing the use case. The use case imports
 * `writeAuditLogUseCase` from `@/application`; we replace that symbol at
 * the module level so the audit call is captured by the test.
 *
 * Uses the same `vi.hoisted` pattern as
 * `update-accepts-online.test.ts` (the precedent for mocking the audit
 * use case at the barrel-export boundary).
 */
const { writeAuditLogUseCase } = vi.hoisted(() => ({
  writeAuditLogUseCase: vi.fn(),
}));

vi.mock("@/application", () => ({
  writeAuditLogUseCase: (...args: unknown[]) =>
    (writeAuditLogUseCase as unknown as (...a: unknown[]) => unknown)(...args),
}));

// ── Test fixture constants ──────────────────────────────────────────────

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const EVENT_ID = "evt-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ROOM_NAME = `cita-${CITA_ID}`;

/**
 * Build a `WebhookEvent`-shaped object with the fields the use case reads.
 *
 * The `WebhookEvent` from `livekit-server-sdk@2.15.4` is a proto3-generated
 * class — TypeScript exposes both `numParticipants` (camelCase alias) and
 * `num_participants` (snake_case, wire JSON form). The use case prefers the
 * snake_case form so it matches the runtime wire format. We set BOTH to
 * avoid coupling to whichever branch the use case picks.
 */
function makeEvent(opts: {
  id?: string;
  roomName?: string;
  numParticipants?: number;
}): WebhookEvent {
  const evt = {
    event: "room_finished",
    id: opts.id ?? EVENT_ID,
    room: {
      name: opts.roomName ?? ROOM_NAME,
      num_participants: opts.numParticipants ?? 0,
      numParticipants: opts.numParticipants ?? 0,
    },
  } as unknown as WebhookEvent;
  return evt;
}

type CitaRow = {
  id: string;
  estado: ConsultationStatus;
  modalidad: ConsultaModalidad;
};

function baseCita(overrides: Partial<CitaRow> = {}): CitaRow {
  return {
    id: CITA_ID,
    estado: ConsultationStatus.EN_CURSO,
    modalidad: ConsultaModalidad.ONLINE,
    ...overrides,
  };
}

/**
 * Builds a minimal Drizzle db stub for the use case.
 *
 * The use case does two operations in sequence:
 *
 *   1. `db.select({...}).from(citas).where(eq(citas.id, ...)).limit(1)`
 *      → returns the configured cita row (or empty)
 *   2. `db.update(citas).set({...}).where(and(eq(citas.id,...),
 *      eq(citas.estado, EN_CURSO))).returning({id: citas.id})`
 *      → returns the configured `updated` rows (use case reads
 *      `result.length` only — `0` is the race-lost branch)
 *
 * The audit write is captured separately via the mocked
 * `writeAuditLogUseCase` (it receives the db as its first arg but the
 * stub ignores it).
 */
function makeDb(opts: {
  cita?: CitaRow | null;
  updated?: ReadonlyArray<{ id: string }>;
}): NodePgDatabase<typeof schema> {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (opts.cita ? [opts.cita] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => opts.updated ?? [],
        }),
      }),
    }),
  } as unknown as NodePgDatabase<typeof schema>;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("autoCompleteOnRoomFinishedUseCase", () => {
  beforeEach(() => {
    writeAuditLogUseCase.mockReset();
    writeAuditLogUseCase.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Scenario 1: ≥1 participant → COMPLETADA ──────────────────────────

  it("transitions to COMPLETADA when at least one participant joined, writes the audit row", async () => {
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.ONLINE,
      }),
      updated: [{ id: CITA_ID }],
    });
    const event = makeEvent({ numParticipants: 2 });

    const result = await autoCompleteOnRoomFinishedUseCase(db, { event });

    expect(result).toEqual({
      citaId: CITA_ID,
      finalState: ConsultationStatus.COMPLETADA,
      transitioned: true,
    });
    expect(writeAuditLogUseCase).toHaveBeenCalledTimes(1);
    const args = writeAuditLogUseCase.mock.calls[0]![1] as {
      usuarioId: string | null;
      accion: string;
      entidadAfectada: string;
      entidadId: string;
      detalles: Record<string, unknown>;
    };
    expect(args.usuarioId).toBeNull();
    expect(args.accion).toBe("CITA_AUTO_COMPLETED_BY_WEBHOOK");
    expect(args.entidadAfectada).toBe("citas");
    expect(args.entidadId).toBe(CITA_ID);
    expect(args.detalles).toEqual({
      eventId: EVENT_ID,
      roomName: ROOM_NAME,
      participantCount: 2,
      finalState: ConsultationStatus.COMPLETADA,
    });
  });

  // ── Scenario 2: 0 participants → NO_ASISTIO ──────────────────────────

  it("transitions to NO_ASISTIO when zero participants joined, audit row reflects finalState", async () => {
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.ONLINE,
      }),
      updated: [{ id: CITA_ID }],
    });
    const event = makeEvent({ numParticipants: 0 });

    const result = await autoCompleteOnRoomFinishedUseCase(db, { event });

    expect(result).toEqual({
      citaId: CITA_ID,
      finalState: ConsultationStatus.NO_ASISTIO,
      transitioned: true,
    });
    expect(writeAuditLogUseCase).toHaveBeenCalledTimes(1);
    const args = writeAuditLogUseCase.mock.calls[0]![1] as {
      detalles: { finalState: string; participantCount: number };
    };
    expect(args.detalles.finalState).toBe(ConsultationStatus.NO_ASISTIO);
    expect(args.detalles.participantCount).toBe(0);
  });

  // ── Scenario 3: PRESENCIAL rejected (D7) ─────────────────────────────

  it("rejects PRESENCIAL with FORBIDDEN — no UPDATE, no audit row (D7 modality gate)", async () => {
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.PRESENCIAL,
      }),
    });
    const event = makeEvent({ numParticipants: 2 });

    await expect(
      autoCompleteOnRoomFinishedUseCase(db, { event }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      autoCompleteOnRoomFinishedUseCase(db, { event }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Cita presencial no procesa webhooks de LiveKit",
    });
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });

  // ── Scenarios 4-6: terminal-state no-op (parameterized) ──────────────

  describe("terminal-state no-op", () => {
    const TERMINAL_STATES = [
      ConsultationStatus.COMPLETADA,
      ConsultationStatus.CANCELADA,
      ConsultationStatus.NO_ASISTIO,
    ];

    for (const estado of TERMINAL_STATES) {
      it(`does NOT transition when cita is already in ${estado}`, async () => {
        const db = makeDb({
          cita: baseCita({
            estado,
            modalidad: ConsultaModalidad.ONLINE,
          }),
        });
        const event = makeEvent({ numParticipants: 2 });

        const result = await autoCompleteOnRoomFinishedUseCase(db, { event });

        // The use case returns success-no-op; the existing terminal state
        // is reported via finalState (CANCELADA is reported as-is even
        // though the strict output type only allows COMPLETADA | NO_ASISTIO).
        expect(result.citaId).toBe(CITA_ID);
        expect(result.transitioned).toBe(true);
        expect(writeAuditLogUseCase).not.toHaveBeenCalled();
      });
    }
  });

  // ── Scenario 7: non-EN_CURSO no-op (CONFIRMADA — D8) ──────────────────

  it("does NOT transition when cita is CONFIRMADA (out-of-order event, D8)", async () => {
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.CONFIRMADA,
        modalidad: ConsultaModalidad.ONLINE,
      }),
    });
    const event = makeEvent({ numParticipants: 1 });

    const result = await autoCompleteOnRoomFinishedUseCase(db, { event });

    expect(result.citaId).toBe(CITA_ID);
    expect(result.transitioned).toBe(true);
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });

  // ── Scenario 8: race lost (doctor beat us) — UPDATE returns 0 rows ───

  it("does NOT write an audit row when the optimistic UPDATE matches zero rows (race lost)", async () => {
    // The doctor beat us: clicked "Completar" between our SELECT and our
    // UPDATE. The optimistic UPDATE's compare-and-swap (`WHERE estado =
    // 'EN_CURSO'`) matches 0 rows; the use case returns success-no-op
    // without an audit row (R11 mitigation).
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.ONLINE,
      }),
      updated: [], // simulate race-lost
    });
    const event = makeEvent({ numParticipants: 2 });

    const result = await autoCompleteOnRoomFinishedUseCase(db, { event });

    // The finalState is the INTENDED finalState (what we tried to write);
    // the actual cita state is whatever the doctor set it to. The route
    // handler does not branch on this value.
    expect(result).toEqual({
      citaId: CITA_ID,
      finalState: ConsultationStatus.COMPLETADA,
      transitioned: true,
    });
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });

  // ── Bonus: invalid room name → BAD_REQUEST, no audit row ─────────────

  it("throws BAD_REQUEST when the room name does not match the expected UUID pattern", async () => {
    const db = makeDb({
      cita: baseCita({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.ONLINE,
      }),
    });
    const event = makeEvent({ roomName: "not-a-cita-room" });

    await expect(
      autoCompleteOnRoomFinishedUseCase(db, { event }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });

  // ── Bonus: cita not found → NOT_FOUND, no audit row ──────────────────

  it("throws NOT_FOUND when no cita matches the parsed UUID", async () => {
    const db = makeDb({ cita: null });
    const event = makeEvent({ numParticipants: 1 });

    await expect(
      autoCompleteOnRoomFinishedUseCase(db, { event }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });
});
