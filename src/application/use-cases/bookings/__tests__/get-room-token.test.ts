import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getRoomTokenUseCase } from "@/application/use-cases/bookings/get-room-token.use-case";
import { UserRole, ConsultationStatus, ConsultaModalidad } from "@/domain/enums";
import * as schema from "@/infrastructure/db/schema";

// Mock the eager module-level LiveKit singleton. The use case now calls
// `livekitServerClient.createRoomToken(...)` (REQ-LI-INIT-1), so we stub
// the module export to return a fake client whose `createRoomToken` is
// the `createTokenSpy` defined below. We use `vi.hoisted` so the spy is
// available inside the `vi.mock` factory (which is hoisted above the test
// file's imports).
const { createTokenSpy, stubClient } = vi.hoisted(() => {
  const createTokenSpy = vi.fn();
  const stubClient = { createRoomToken: createTokenSpy };
  return { createTokenSpy, stubClient };
});

vi.mock("@/infrastructure/livekit/livekit-server", () => ({
  livekitServerClient: stubClient,
}));

/**
 * The use case does:
 *   db.select({...}).from(citas).innerJoin(doctores,...).innerJoin(pacientes,...)
 *     .where(eq(citas.id, ...)).limit(1)
 *
 * We mock the chain to return either `null` (no cita) or a single row
 * with the fields the use case reads.
 *
 * `modalidad` was added in PR-A and is the modality gate's source of truth
 * (PR-B, D6). Existing tests default to ONLINE so the pre-PR-B happy path
 * continues to pass; new tests cover the PRESENCIAL rejection paths.
 */

type Row = {
  id: string;
  fechaHora: Date;
  estado: ConsultationStatus;
  modalidad: ConsultaModalidad;
  doctorUsuarioId: string;
  pacienteUsuarioId: string;
};

function makeDb(rows: ReadonlyArray<Row>): NodePgDatabase<typeof schema> {
  const terminal = (rs: ReadonlyArray<Row>) => ({
    limit: () => Promise.resolve(rs as Row[]),
  });
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => terminal(rows),
          }),
        }),
      }),
    }),
  } as unknown as NodePgDatabase<typeof schema>;
}

const DOCTOR_USER_ID = "user-doctor-1";
const PATIENT_USER_ID = "user-paciente-1";
const OTHER_USER_ID = "user-stranger-1";
const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";

function baseRow(overrides: Partial<Row> = {}): Row {
  return {
    id: CITA_ID,
    fechaHora: new Date(),
    estado: ConsultationStatus.CONFIRMADA,
    modalidad: ConsultaModalidad.ONLINE,
    doctorUsuarioId: DOCTOR_USER_ID,
    pacienteUsuarioId: PATIENT_USER_ID,
    ...overrides,
  };
}

describe("getRoomTokenUseCase", () => {
  // `createTokenSpy` comes from the `vi.hoisted` block at the top of the
  // file — it is wired into the `vi.mock` factory so the use case's
  // `livekitServerClient.createRoomToken(...)` call invokes THIS spy.
  // Re-declaring it here would shadow the hoisted reference and break
  // the mock wiring.
  let originalNow: () => number;

  beforeEach(() => {
    // The use case calls `livekitServerClient.createRoomToken(...)`.
    // The module mock (above) wires the stub client so this is the
    // `createRoomToken` we exercise. Configure its return value here so we
    // can assert call args without hitting the real LiveKit SDK.
    createTokenSpy.mockResolvedValue({
      token: "jwt-fixture",
      serverUrl: "ws://localhost:7880",
      roomName: `cita-${CITA_ID}`,
    });
    // Pin "now" so the symmetric window is deterministic.
    originalNow = Date.now;
    Date.now = () => new Date("2026-06-16T14:00:00Z").getTime();
  });

  afterEach(() => {
    createTokenSpy.mockReset();
    Date.now = originalNow;
    vi.restoreAllMocks();
  });

  it("throws NOT_FOUND when the cita does not exist", async () => {
    const db = makeDb([]); // empty
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND with the same shape when the actor is not a participant", async () => {
    const db = makeDb([baseRow()]); // cita exists, but actor is the stranger
    const notFoundErr = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: OTHER_USER_ID, role: UserRole.DOCTOR },
    }).catch((e: unknown) => e);
    expect(notFoundErr).toBeInstanceOf(TRPCError);
    expect(notFoundErr).toMatchObject({ code: "NOT_FOUND" });
  });

  it("passes auth when the doctor is the cita's doctor (and cita is CONFIRMADA inside window)", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T14:05:00Z") }), // 5 min in the future
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(result.token).toBe("jwt-fixture");
    expect(result.serverUrl).toBe("ws://localhost:7880");
    expect(result.roomName).toBe(`cita-${CITA_ID}`);
  });

  it("passes auth when the patient is the cita's patient", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T14:05:00Z") }),
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: PATIENT_USER_ID, role: UserRole.PACIENTE },
    });
    expect(result.token).toBe("jwt-fixture");
  });

  it("throws FORBIDDEN with the PENDIENTE message for a PENDIENTE cita", async () => {
    const db = makeDb([baseRow({ estado: ConsultationStatus.PENDIENTE })]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "La cita debe estar confirmada antes de unirse a la videollamada.",
    });
  });

  it("throws FORBIDDEN with the CONFIRMADA-outside-window message for CONFIRMADA 30 min in the future", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T14:30:00Z") }),
    ]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "La videollamada se habilita 15 minutos antes de la hora de la cita.",
    });
  });

  it("passes when CONFIRMADA is 10 min in the past (symmetric window)", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T13:50:00Z") }),
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(result.token).toBe("jwt-fixture");
  });

  it("passes when CONFIRMADA is 5 min in the future", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T14:05:00Z") }),
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(result.token).toBe("jwt-fixture");
  });

  it("passes when EN_CURSO regardless of time (7 days in the future)", async () => {
    const db = makeDb([
      baseRow({
        estado: ConsultationStatus.EN_CURSO,
        fechaHora: new Date("2026-06-23T14:00:00Z"),
      }),
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(result.token).toBe("jwt-fixture");
  });

  it("throws FORBIDDEN for COMPLETADA", async () => {
    const db = makeDb([baseRow({ estado: ConsultationStatus.COMPLETADA })]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita ya no permite unirse a una videollamada.",
    });
  });

  it("throws FORBIDDEN for CANCELADA", async () => {
    const db = makeDb([baseRow({ estado: ConsultationStatus.CANCELADA })]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita ya no permite unirse a una videollamada.",
    });
  });

  it("throws FORBIDDEN for NO_ASISTIO", async () => {
    const db = makeDb([baseRow({ estado: ConsultationStatus.NO_ASISTIO })]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita ya no permite unirse a una videollamada.",
    });
  });

  it("builds the LiveKit identity as ${role.toLowerCase()}-${id} and the room name as cita-${citaId}", async () => {
    const db = makeDb([
      baseRow({ fechaHora: new Date("2026-06-16T14:05:00Z") }),
    ]);
    await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(createTokenSpy).toHaveBeenCalledWith({
      identity: `doctor-${DOCTOR_USER_ID}`,
      roomName: `cita-${CITA_ID}`,
      ttl: "1h",
    });

    createTokenSpy.mockClear();
    await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: PATIENT_USER_ID, role: UserRole.PACIENTE },
    });
    expect(createTokenSpy).toHaveBeenCalledWith({
      identity: `paciente-${PATIENT_USER_ID}`,
      roomName: `cita-${CITA_ID}`,
      ttl: "1h",
    });
  });

  // ── modality-toggle (PR-B) — D6 modality gate ──────────────────────────

  it("PRESENCIAL + CONFIRMADA + within window: rejects with the modality-specific message", async () => {
    const db = makeDb([
      baseRow({
        estado: ConsultationStatus.CONFIRMADA,
        modalidad: ConsultaModalidad.PRESENCIAL,
        fechaHora: new Date("2026-06-16T14:05:00Z"),
      }),
    ]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita es presencial, no permite videollamada",
    });
    // The token MUST NOT be issued for a PRESENCIAL cita under any circumstance.
    expect(createTokenSpy).not.toHaveBeenCalled();
  });

  it("PRESENCIAL + EN_CURSO: still rejected with the modality message (time gate bypassed, modality gate runs)", async () => {
    const db = makeDb([
      baseRow({
        estado: ConsultationStatus.EN_CURSO,
        modalidad: ConsultaModalidad.PRESENCIAL,
        fechaHora: new Date("2026-06-23T14:00:00Z"), // 7 days in the future
      }),
    ]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Esta cita es presencial, no permite videollamada",
    });
    expect(createTokenSpy).not.toHaveBeenCalled();
  });

  it("PRESENCIAL + CONFIRMADA + outside window: gets the time-window message, NOT the modality message (gate order)", async () => {
    // Per R2 / D6: the modality gate is the LAST gate. A PRESENCIAL cita
    // outside the time window still gets the time-window message so the
    // caller can render the right copy.
    const db = makeDb([
      baseRow({
        estado: ConsultationStatus.CONFIRMADA,
        modalidad: ConsultaModalidad.PRESENCIAL,
        fechaHora: new Date("2026-06-16T14:30:00Z"), // 30 min in the future
      }),
    ]);
    await expect(
      getRoomTokenUseCase(db, {
        citaId: CITA_ID,
        actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "La videollamada se habilita 15 minutos antes de la hora de la cita.",
    });
  });

  it("ONLINE + CONFIRMADA + within window: regression guard (D13) — the new gate does not over-eagerly reject", async () => {
    // Per D13: re-running the pre-existing ONLINE happy-path scenario is
    // non-negotiable. The modality gate must NOT over-eagerly reject an
    // ONLINE cita; the existing token issuance path is unchanged.
    const db = makeDb([
      baseRow({
        estado: ConsultationStatus.CONFIRMADA,
        modalidad: ConsultaModalidad.ONLINE,
        fechaHora: new Date("2026-06-16T14:05:00Z"),
      }),
    ]);
    const result = await getRoomTokenUseCase(db, {
      citaId: CITA_ID,
      actor: { id: DOCTOR_USER_ID, role: UserRole.DOCTOR },
    });
    expect(result.token).toBe("jwt-fixture");
    expect(result.serverUrl).toBe("ws://localhost:7880");
    expect(result.roomName).toBe(`cita-${CITA_ID}`);
  });
});
