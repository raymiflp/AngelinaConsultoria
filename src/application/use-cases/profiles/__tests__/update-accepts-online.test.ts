import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Mock the audit write BEFORE importing the use case.
 * The use case imports `writeAuditLogUseCase` from `@/application`; we
 * replace that symbol at the module level so the transaction's audit
 * write is captured.
 */
const { writeAuditLogUseCase } = vi.hoisted(() => ({
  writeAuditLogUseCase: vi.fn(),
}));

vi.mock("@/application", () => ({
  writeAuditLogUseCase: (...args: unknown[]) =>
    (writeAuditLogUseCase as unknown as (...a: unknown[]) => unknown)(...args),
}));

import { updateAcceptsOnlineUseCase } from "@/application/use-cases/profiles/update-accepts-online.use-case";
import * as schema from "@/infrastructure/db/schema";

/**
 * Builds a minimal Drizzle db stub for the updateAcceptsOnline use case.
 *
 * The use case calls `db.transaction(async (tx) => ...)`. Inside the
 * transaction, it does:
 *
 *   tx.update(doctores).set({...}).where(...).returning({...})
 *     → returns the rows configured here
 *
 * The audit write is captured separately via the mocked
 * `writeAuditLogUseCase` (it receives the tx as its first arg, but the
 * stub ignores it).
 */
function makeDb(opts: {
  updated: ReadonlyArray<{ id: string; aceptaOnline: boolean }>;
}) {
  return {
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => opts.updated,
            }),
          }),
        }),
      };
      return fn(tx);
    },
  };
}

const DOCTOR_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const ACTOR_ID = "user-doc-1";

describe("updateAcceptsOnlineUseCase", () => {
  beforeEach(() => {
    writeAuditLogUseCase.mockReset();
    writeAuditLogUseCase.mockResolvedValue(undefined);
  });

  it("updates from false to true, writes the audit row, returns { id, aceptaOnline: true }", async () => {
    const db = makeDb({
      updated: [{ id: DOCTOR_ID, aceptaOnline: true }],
    }) as unknown as NodePgDatabase<typeof schema>;

    const result = await updateAcceptsOnlineUseCase(db, {
      doctorId: DOCTOR_ID,
      aceptaOnline: true,
      actorId: ACTOR_ID,
      ipAddress: "127.0.0.1",
    });

    expect(result).toEqual({ id: DOCTOR_ID, aceptaOnline: true });
    expect(writeAuditLogUseCase).toHaveBeenCalledTimes(1);
    const args = writeAuditLogUseCase.mock.calls[0]![1] as {
      usuarioId: string;
      accion: string;
      entidadAfectada: string;
      entidadId: string;
      detalles: { aceptaOnline: boolean };
      direccionIP: string;
    };
    expect(args).toEqual({
      usuarioId: ACTOR_ID,
      accion: "DOCTOR_ACEPTA_ONLINE_CHANGED",
      entidadAfectada: "doctores",
      entidadId: DOCTOR_ID,
      detalles: { aceptaOnline: true },
      direccionIP: "127.0.0.1",
    });
  });

  it("updates from true to false and writes the audit row with detalles: { aceptaOnline: false }", async () => {
    const db = makeDb({
      updated: [{ id: DOCTOR_ID, aceptaOnline: false }],
    }) as unknown as NodePgDatabase<typeof schema>;

    const result = await updateAcceptsOnlineUseCase(db, {
      doctorId: DOCTOR_ID,
      aceptaOnline: false,
      actorId: ACTOR_ID,
    });

    expect(result).toEqual({ id: DOCTOR_ID, aceptaOnline: false });
    expect(writeAuditLogUseCase).toHaveBeenCalledTimes(1);
    const args = writeAuditLogUseCase.mock.calls[0]![1] as {
      detalles: { aceptaOnline: boolean };
    };
    expect(args.detalles).toEqual({ aceptaOnline: false });
  });

  it("throws NOT_FOUND when the doctor row does not exist", async () => {
    const db = makeDb({ updated: [] }) as unknown as NodePgDatabase<typeof schema>;

    await expect(
      updateAcceptsOnlineUseCase(db, {
        doctorId: DOCTOR_ID,
        aceptaOnline: true,
        actorId: ACTOR_ID,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    // No audit row is written when the UPDATE returns 0 rows.
    expect(writeAuditLogUseCase).not.toHaveBeenCalled();
  });

  it("propagates audit write failures (transaction roll-back happens at the DB layer)", async () => {
    const db = makeDb({
      updated: [{ id: DOCTOR_ID, aceptaOnline: true }],
    }) as unknown as NodePgDatabase<typeof schema>;
    writeAuditLogUseCase.mockRejectedValueOnce(
      new Error("audit insert failed"),
    );

    await expect(
      updateAcceptsOnlineUseCase(db, {
        doctorId: DOCTOR_ID,
        aceptaOnline: true,
        actorId: ACTOR_ID,
      }),
    ).rejects.toThrow("audit insert failed");
  });

  it("defaults direccionIP to 'unknown' when omitted", async () => {
    const db = makeDb({
      updated: [{ id: DOCTOR_ID, aceptaOnline: true }],
    }) as unknown as NodePgDatabase<typeof schema>;

    await updateAcceptsOnlineUseCase(db, {
      doctorId: DOCTOR_ID,
      aceptaOnline: true,
      actorId: ACTOR_ID,
    });

    const args = writeAuditLogUseCase.mock.calls[0]![1] as {
      direccionIP: string;
    };
    expect(args.direccionIP).toBe("unknown");
  });
});
