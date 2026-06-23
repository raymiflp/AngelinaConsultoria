import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle> | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is required");

const client = postgres(connectionString, { max: 10 });
const db = drizzle(client, { schema });

globalForDb.db = globalForDb.db ?? db;

export { db };
export default db;