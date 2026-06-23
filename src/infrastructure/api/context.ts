import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "@/infrastructure/db";
import { auth } from "@/auth";

/**
 * Context injected into every tRPC procedure.
 *
 * - `db`: Drizzle ORM client (singleton from `@/infrastructure/db`).
 * - `session`: nullable auth session resolved from Auth.js.
 * - `headers`: request headers for rate limiting and audit logging.
 */
export interface Context {
  db: typeof db;
  session: {
    user: { id: string; email: string; name: string; role: string };
  } | null;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Async context factory executed per request.
 *
 * Receives `opts` from the tRPC adapter (fetch or server-side caller)
 * and resolves the auth session + request headers.
 */
export async function createContext(
  opts?: FetchCreateContextFnOptions,
): Promise<Context> {
  const session = await auth();

  // Extract headers from the incoming request
  let reqHeaders: Record<string, string | string[] | undefined> = {};
  if (opts?.req) {
    // opts.req.headers is a Headers object (fetch API)
    const h = opts.req.headers;
    reqHeaders = {
      "x-forwarded-for": h.get("x-forwarded-for") ?? undefined,
      "x-real-ip": h.get("x-real-ip") ?? undefined,
      "user-agent": h.get("user-agent") ?? undefined,
    };
  }

  return {
    db,
    session: session?.user
      ? {
          user: {
            id: session.user.id as string,
            email: session.user.email as string,
            name: session.user.name as string,
            role: (session.user as { role?: string }).role ?? "",
          },
        }
      : null,
    headers: reqHeaders,
  };
}
