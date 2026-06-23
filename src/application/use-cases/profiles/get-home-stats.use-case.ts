import { count, countDistinct, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/infrastructure/db/schema";

export interface HomeStats {
  totalVerifiedDoctors: number;
  totalSpecialties: number;
}

/**
 * Computes the home page trust-counter statistics:
 *
 * - `totalVerifiedDoctors`: `COUNT(*) FROM doctores WHERE verificado = true`
 * - `totalSpecialties`: `COUNT(DISTINCT especialidad) FROM doctores WHERE verificado = true`
 *
 * Runs the two queries in parallel via `Promise.all` so the round-trip cost
 * is one DB latency. Postgres `COUNT` returns `string` in node-postgres; the
 * use case coerces with `Number(...)`.
 *
 * The use case does NOT catch errors — the safe-fallback boundary (returning
 * `{ 0, 0 }` on a DB outage so the home page never 500s) lives in the tRPC
 * procedure wrapper, not here.
 */
export async function getHomeStatsUseCase(
  db: NodePgDatabase<typeof schema>,
): Promise<HomeStats> {
  const [verifiedRow, specialtyRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.doctores)
      .where(eq(schema.doctores.verificado, true))
      .then((rows) => rows[0] ?? null),
    db
      .select({ n: countDistinct(schema.doctores.especialidad) })
      .from(schema.doctores)
      .where(eq(schema.doctores.verificado, true))
      .then((rows) => rows[0] ?? null),
  ]);

  return {
    totalVerifiedDoctors: Number(verifiedRow?.n ?? 0),
    totalSpecialties: Number(specialtyRow?.n ?? 0),
  };
}
