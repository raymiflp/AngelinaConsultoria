import { NextResponse } from "next/server";
import { db } from "@/infrastructure/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/health
 *
 * Lightweight health check endpoint for monitoring and orchestration.
 * Returns DB connectivity status and basic uptime info.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  // Database check — execute raw query
  try {
    await db.execute(sql`SELECT 1 AS ok`);
    checks.database = "connected";
  } catch {
    checks.database = "disconnected";
  }

  const allOk = Object.values(checks).every((s) => s === "connected");

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
