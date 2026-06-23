import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Mock the analytics module BEFORE importing the use case. The use case
// calls `captureEvent(...)` as fire-and-forget telemetry; we replace it
// with a no-op so the test never reaches the real PostHog SDK.
vi.mock("@/infrastructure/analytics", () => ({
  captureEvent: vi.fn(),
  EVENTS: { APPOINTMENT_CREATED: "appointment_created" },
}));

import { createAppointmentUseCase } from "@/application/use-cases/bookings/create-appointment.use-case";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";
import { citas, doctores, doctorDisponibilidad } from "@/infrastructure/db/schema";
import * as schema from "@/infrastructure/db/schema";

/**
 * Test plan for `createAppointmentUseCase` modality validation (modality-toggle, PR-B):
 *
 *   1. ONLINE rejected when doctor.aceptaOnline === false (BAD_REQUEST, no insert)
 *   2. ONLINE accepted when doctor.aceptaOnline === true
 *   3. PRESENCIAL always accepted regardless of doctor.aceptaOnline
 *   4. TOCTOU window: doctor toggles to false mid-transaction, ONLINE booking rejected
 *   5. Persists modalidad in the cita (read back the inserted row)
 *
 * The use case flows:
 *   tx.select({id}).from(citas).where(AND).for("update")              → conflict check
 *   tx.select().from(doctorDisponibilidad).where(eq).then(handler)    → availability check
 *   tx.select({aceptaOnline}).from(doctores).where(eq).limit(1).then  → MODALITY GATE (NEW)
 *   tx.insert(citas).values({...}).returning()                        → INSERT
 *
 * The mock distinguishes the three `tx.select(...).from(...)` chains by
 * matching the table reference on `.from()`.
 */

// ── Helpers ───────────────────────────────────────────────────────────

const DOCTOR_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const PACIENTE_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000002";
const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000003";

/**
 * A `fechaHora` pinned to next Monday at 10:00 local time. Picking a fixed
 * weekday + in-range time avoids late-evening test runs landing on a
 * Saturday/Sunday or a time outside the 09:00-18:00 availability window.
 */
function futureFechaHora(): string {
  const d = new Date();
  // Days until next Monday (always future, even when today is Monday).
  const daysUntilMonday = ((1 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

type Availability = {
  disponibilidad: Record<string, Array<{ inicio: string; fin: string }>>;
};

type DoctorAceptaRow = { aceptaOnline: boolean };

type InsertedCita = {
  id: string;
  doctorId: string;
  pacienteId: string;
  fechaHora: Date;
  estado: string;
  motivo: string;
  duracionMinutos: number;
  modalidad: string;
};

type DbOpts = {
  conflicting?: ReadonlyArray<{ id: string }>;
  availability?: Availability | null;
  /**
   * Per-call values for the doctor.aceptaOnline SELECT. The first call
   * returns the first element, the second call returns the second element,
   * etc. Defaults to `[{ aceptaOnline: true }]` for a single read.
   */
  doctorAceptaOnlineQueue?: ReadonlyArray<DoctorAceptaRow>;
  inserted?: InsertedCita | null;
  /**
   * If false, the tx.insert call returns an empty array (no row). Use this
   * to assert that the gate short-circuits the transaction without
   * inserting. Defaults to true (insert succeeds).
   */
  allowInsert?: boolean;
};

/**
 * Builds a minimal Drizzle db stub for the create-appointment use case.
 *
 * The mock distinguishes the three `tx.select(...).from(table)` calls by
 * matching the table reference (the existing tests use the same trick).
 */
function makeDb(opts: DbOpts = {}) {
  const doctorQueue: DoctorAceptaRow[] =
    opts.doctorAceptaOnlineQueue && opts.doctorAceptaOnlineQueue.length > 0
      ? [...opts.doctorAceptaOnlineQueue]
      : [{ aceptaOnline: true }];

  const inserted: InsertedCita = opts.inserted ?? {
    id: CITA_ID,
    doctorId: DOCTOR_ID,
    pacienteId: PACIENTE_ID,
    fechaHora: new Date(futureFechaHora()),
    estado: ConsultationStatus.PENDIENTE,
    motivo: "Dolor de cabeza",
    duracionMinutos: 30,
    modalidad: ConsultaModalidad.PRESENCIAL,
  };

  const availability: Availability | null =
    opts.availability === undefined
      ? {
          disponibilidad: {
            lunes: [{ inicio: "09:00", fin: "18:00" }],
            martes: [{ inicio: "09:00", fin: "18:00" }],
            miercoles: [{ inicio: "09:00", fin: "18:00" }],
            jueves: [{ inicio: "09:00", fin: "18:00" }],
            viernes: [{ inicio: "09:00", fin: "18:00" }],
          },
        }
      : opts.availability;

  const txSelectMock = vi.fn().mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => {
        if (table === citas) {
          // conflict check: chain ends with .for("update") → array
          return {
            for: () => Promise.resolve(opts.conflicting ?? []),
          };
        }
        if (table === doctorDisponibilidad) {
          // availability check: chain ends with .then(handler) → row | null
          return {
            then: (resolve: (rows: ReadonlyArray<Availability>) => unknown) =>
              Promise.resolve(availability ? [availability] : []).then(resolve),
          };
        }
        if (table === doctores) {
          // MODALITY GATE: chain ends with .limit(1).then(handler) → row | null
          const next = doctorQueue.shift() ?? { aceptaOnline: true };
          return {
            limit: () => ({
              then: (
                resolve: (rows: ReadonlyArray<DoctorAceptaRow>) => unknown,
              ) => Promise.resolve([next]).then(resolve),
            }),
          };
        }
        throw new Error(`Unexpected table in tx.select.from: ${String(table)}`);
      },
    }),
  }));

  const insertMock = vi.fn().mockImplementation(() => ({
    values: () => ({
      returning: async () => (opts.allowInsert === false ? [] : [inserted]),
    }),
  }));

  const tx = {
    select: txSelectMock,
    insert: insertMock,
  };

  return {
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(tx),
    _insertMock: insertMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("createAppointmentUseCase — modality validation (modality-toggle, PR-B)", () => {
  it("rejects ONLINE when doctor.aceptaOnline === false (BAD_REQUEST, no insert)", async () => {
    const db = makeDb({
      doctorAceptaOnlineQueue: [{ aceptaOnline: false }],
      allowInsert: false,
    }) as unknown as NodePgDatabase<typeof schema>;

    await expect(
      createAppointmentUseCase(db, {
        doctorId: DOCTOR_ID,
        pacienteId: PACIENTE_ID,
        fechaHora: futureFechaHora(),
        motivoConsulta: "Dolor de cabeza",
        modalidad: ConsultaModalidad.ONLINE,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El doctor no ofrece consultas online",
    });
  });

  it("accepts ONLINE when doctor.aceptaOnline === true and persists modalidad = 'ONLINE'", async () => {
    const db = makeDb({
      doctorAceptaOnlineQueue: [{ aceptaOnline: true }],
      inserted: {
        id: CITA_ID,
        doctorId: DOCTOR_ID,
        pacienteId: PACIENTE_ID,
        fechaHora: new Date(futureFechaHora()),
        estado: ConsultationStatus.PENDIENTE,
        motivo: "Control",
        duracionMinutos: 30,
        modalidad: ConsultaModalidad.ONLINE,
      },
    }) as unknown as NodePgDatabase<typeof schema>;

    const result = await createAppointmentUseCase(db, {
      doctorId: DOCTOR_ID,
      pacienteId: PACIENTE_ID,
      fechaHora: futureFechaHora(),
      motivoConsulta: "Control",
      modalidad: ConsultaModalidad.ONLINE,
    });

    expect(result.modalidad).toBe(ConsultaModalidad.ONLINE);
  });

  it("accepts PRESENCIAL regardless of doctor.aceptaOnline (skips the modality gate)", async () => {
    const db = makeDb({
      doctorAceptaOnlineQueue: [{ aceptaOnline: false }],
      inserted: {
        id: CITA_ID,
        doctorId: DOCTOR_ID,
        pacienteId: PACIENTE_ID,
        fechaHora: new Date(futureFechaHora()),
        estado: ConsultationStatus.PENDIENTE,
        motivo: "Consulta presencial",
        duracionMinutos: 30,
        modalidad: ConsultaModalidad.PRESENCIAL,
      },
    }) as unknown as NodePgDatabase<typeof schema>;

    const result = await createAppointmentUseCase(db, {
      doctorId: DOCTOR_ID,
      pacienteId: PACIENTE_ID,
      fechaHora: futureFechaHora(),
      motivoConsulta: "Consulta presencial",
      modalidad: ConsultaModalidad.PRESENCIAL,
    });

    expect(result.modalidad).toBe(ConsultaModalidad.PRESENCIAL);
  });

  it("TOCTOU window: doctor toggles aceptaOnline to false mid-transaction, ONLINE booking is rejected", async () => {
    // The in-transaction read sees the new `false` value. A patient who
    // opened the page while the doctor was still opted-in is correctly
    // rejected at submit time (D5 / AD-13 / R3).
    const db = makeDb({
      doctorAceptaOnlineQueue: [{ aceptaOnline: false }],
      allowInsert: false,
    }) as unknown as NodePgDatabase<typeof schema>;

    await expect(
      createAppointmentUseCase(db, {
        doctorId: DOCTOR_ID,
        pacienteId: PACIENTE_ID,
        fechaHora: futureFechaHora(),
        motivoConsulta: "Dolor de cabeza",
        modalidad: ConsultaModalidad.ONLINE,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El doctor no ofrece consultas online",
    });
  });

  it("persists modalidad in the cita (read back the inserted row)", async () => {
    const inserted: InsertedCita = {
      id: CITA_ID,
      doctorId: DOCTOR_ID,
      pacienteId: PACIENTE_ID,
      fechaHora: new Date(futureFechaHora()),
      estado: ConsultationStatus.PENDIENTE,
      motivo: "Video consulta",
      duracionMinutos: 30,
      modalidad: ConsultaModalidad.ONLINE,
    };
    const db = makeDb({
      doctorAceptaOnlineQueue: [{ aceptaOnline: true }],
      inserted,
    }) as unknown as NodePgDatabase<typeof schema>;

    const result = await createAppointmentUseCase(db, {
      doctorId: DOCTOR_ID,
      pacienteId: PACIENTE_ID,
      fechaHora: futureFechaHora(),
      motivoConsulta: "Video consulta",
      modalidad: ConsultaModalidad.ONLINE,
    });

    expect(result.id).toBe(CITA_ID);
    expect(result.modalidad).toBe(ConsultaModalidad.ONLINE);
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.pacienteId).toBe(PACIENTE_ID);
    expect(result.estado).toBe(ConsultationStatus.PENDIENTE);
    expect(result.duracionMinutos).toBe(30);
  });
});
