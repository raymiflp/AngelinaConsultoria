import { describe, expect, it } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getHomeStatsUseCase } from "@/application/use-cases/profiles/get-home-stats.use-case";
import * as schema from "@/infrastructure/db/schema";

/**
 * Builds a minimal Drizzle db stub. The use case does
 *   chain.then((rows) => rows[0] ?? null)
 * so each call resolves with an array of rows. `rows` is consumed FIFO.
 * The use case calls Promise.all over two chains, so we provide two arrays.
 */
function makeDb(
  verifiedRows: ReadonlyArray<{ n: string }>,
  specialtyRows: ReadonlyArray<{ n: string }>,
): NodePgDatabase<typeof schema> {
  // Each `db.select(...).from(...).where(...)` invocation produces a new
  // terminal thenable, so we can return different resolved values per call.
  const terminal = (rows: ReadonlyArray<{ n: string }>) => ({
    then: (
      onFulfilled: (rows: ReadonlyArray<{ n: string }>) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  });
  const fromChain = (rows: ReadonlyArray<{ n: string }>) => ({
    where: () => terminal(rows),
  });
  let call = 0;
  const responses = [verifiedRows, specialtyRows];
  return {
    select: () => ({
      from: () => fromChain(responses[call++] ?? []),
    }),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe("getHomeStatsUseCase", () => {
  it("returns both counts on a happy path (5 doctors, 3 specialties)", async () => {
    const db = makeDb([{ n: "5" }], [{ n: "3" }]);
    const stats = await getHomeStatsUseCase(db);
    expect(stats).toEqual({ totalVerifiedDoctors: 5, totalSpecialties: 3 });
  });

  it("returns { 0, 0 } on an empty database (queries resolve with 0 rows)", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as unknown as NodePgDatabase<typeof schema>;

    const stats = await getHomeStatsUseCase(db);
    expect(stats).toEqual({ totalVerifiedDoctors: 0, totalSpecialties: 0 });
  });

  it("propagates DB errors (the procedure is the safe-fallback boundary)", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(new Error("connection refused")),
        }),
      }),
    } as unknown as NodePgDatabase<typeof schema>;

    await expect(getHomeStatsUseCase(db)).rejects.toThrow("connection refused");
  });

  it("deduplicates specialties (verified=4, distinct specialties=3)", async () => {
    const db = makeDb([{ n: "4" }], [{ n: "3" }]);
    const stats = await getHomeStatsUseCase(db);
    expect(stats.totalVerifiedDoctors).toBe(4);
    expect(stats.totalSpecialties).toBe(3);
  });
});
