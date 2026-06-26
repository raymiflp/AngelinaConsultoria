import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle> | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is required");

// ADR-0001 (Vercel-Only): on Vercel, DATABASE_URL MUST include
// `?pgbouncer=true&connection_limit=1` so the pooler caps per-Lambda
// connections at 1. The driver still uses `max: 10` as a defense-in-depth
// against runaway bursts; the pooler enforces the real limit.
// Local dev (docker-compose Postgres) does not need this annotation.
const client = postgres(connectionString, { max: 10 });
const db = drizzle(client, { schema });

globalForDb.db = globalForDb.db ?? db;

export { db };
export default db;