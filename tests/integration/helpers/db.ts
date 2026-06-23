import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";

let client: postgres.Sql<{}> | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Returns a drizzle database connection for integration tests.
 *
 * Reads TEST_DATABASE_URL first, falls back to DATABASE_URL.
 * Lazily initialises the connection — safe to call across tests.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (dbInstance) return dbInstance;

  const connectionString =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL or DATABASE_URL environment variable is required",
    );
  }

  client = postgres(connectionString, { max: 1, ssl: "prefer" });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

/**
 * Resets all tables between tests by truncating in dependency order.
 * Safe to call multiple times — no-op if no connection has been opened.
 */
export async function resetDb(): Promise<void> {
  if (!dbInstance) return;

  await dbInstance.execute(sql`
    TRUNCATE TABLE
      audit_logs,
      doctor_disponibilidad,
      citas,
      pacientes,
      doctores,
      consentimientos,
      usuarios
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Closes the underlying postgres connection.
 * Call once after all tests have finished.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    dbInstance = null;
  }
}
