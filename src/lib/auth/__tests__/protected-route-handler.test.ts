import { describe, it, expect, vi } from "vitest";
import { buildProtectedRouteHandler } from "@/lib/auth/protected-route-handler";

/**
 * Tests for the protected-route middleware handler.
 *
 * The handler is intentionally pure (no Auth.js coupling) so it can be
 * unit-tested in jsdom. The default `middleware.ts` at the project root
 * wires it to Auth.js's `auth()` wrapper — that integration is covered
 * manually (start `pnpm dev`, hit /dashboard while logged out).
 */

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRequest(
  pathname: string,
  search = "",
  host = "localhost:3000",
): URL {
  // The handler only reads `req.nextUrl` (a URL instance), so we hand it
  // a real URL. The NextRequest wrapper is not needed for the handler's
  // own logic — the integration is the middleware's job.
  return new URL(`${pathname}${search}`, `http://${host}`);
}

// The handler accepts a `NextRequest` but only ever reads `nextUrl` and
// uses `NextResponse.next/redirect` — both of which work in jsdom. We
// type-cast to keep the test minimal.

// ── Tests ───────────────────────────────────────────────────────────────

describe("buildProtectedRouteHandler", () => {
  it("passes through an authenticated request", () => {
    const handler = buildProtectedRouteHandler(() => true);
    const req = { nextUrl: makeRequest("/dashboard") } as never;
    const res = handler(req);
    // NextResponse.next() returns a response with no Location header
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects an unauthenticated request to /login with callbackUrl", () => {
    const handler = buildProtectedRouteHandler(() => false);
    const req = { nextUrl: makeRequest("/dashboard") } as never;
    const res = handler(req);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    expect(location).toContain("/login");
    // The callbackUrl is the original path, URL-encoded as %2Fdashboard
    expect(location).toContain("callbackUrl=%2Fdashboard");
  });

  it("preserves query params in the callbackUrl", () => {
    const handler = buildProtectedRouteHandler(() => false);
    const req = { nextUrl: makeRequest("/citas/abc-123", "?tab=info") } as never;
    const res = handler(req);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=");
    expect(location).toContain("%2Fcitas%2Fabc-123");
    expect(location).toContain("tab%3Dinfo");
  });

  it("uses req.auth to determine authentication when isLoggedIn reads it", () => {
    const handler = buildProtectedRouteHandler((r) => {
      const req = r as { auth?: unknown };
      return req.auth !== null && req.auth !== undefined;
    });
    const authedReq = { nextUrl: makeRequest("/perfil"), auth: { user: { id: "u1" } } } as never;
    const anonReq = { nextUrl: makeRequest("/perfil"), auth: null } as never;
    expect(handler(authedReq).headers.get("location")).toBeNull();
    expect(handler(anonReq).headers.get("location")).toContain("/login");
  });

  it("redirect status is a 3xx (redirect, not error)", () => {
    const handler = buildProtectedRouteHandler(() => false);
    const req = { nextUrl: makeRequest("/configuracion") } as never;
    const res = handler(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });
});

describe("PROTECTED_PATHS (single source of truth for middleware matcher)", () => {
  it("covers /dashboard, /perfil, /citas, /configuracion, /pacientes", async () => {
    const { PROTECTED_PATHS } = await import("@/lib/auth/protected-paths");
    expect(PROTECTED_PATHS).toContain("/dashboard/:path*");
    expect(PROTECTED_PATHS).toContain("/perfil/:path*");
    expect(PROTECTED_PATHS).toContain("/citas/:path*");
    expect(PROTECTED_PATHS).toContain("/configuracion");
    expect(PROTECTED_PATHS).toContain("/pacientes");
    expect(PROTECTED_PATHS).toContain("/pacientes/:path*");
  });

  it("has 6 entries (one per protected area)", async () => {
    const { PROTECTED_PATHS } = await import("@/lib/auth/protected-paths");
    expect(PROTECTED_PATHS).toHaveLength(6);
  });

  it("does not include any /api routes (those have their own auth)", async () => {
    const { PROTECTED_PATHS } = await import("@/lib/auth/protected-paths");
    for (const p of PROTECTED_PATHS) {
      expect(p.startsWith("/api/")).toBe(false);
    }
  });
});

describe("middleware.ts is wired correctly", () => {
  // The middleware file imports Auth.js and is run in the edge runtime —
  // it can't be loaded directly in jsdom. We read the source and assert
  // structural invariants instead.

  async function readMiddlewareSource(): Promise<string> {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    // With `src/` directory, the middleware lives at `src/middleware.ts`.
    // Placing it at the project root causes Next.js to silently ignore it
    // (middleware-manifest.json stays empty), so the path matters.
    const middlewarePath = path.resolve(process.cwd(), "src/middleware.ts");
    return readFile(middlewarePath, "utf8");
  }

  it("lives at src/middleware.ts (NOT project root)", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const rootMiddleware = path.resolve(process.cwd(), "middleware.ts");
    await expect(readFile(rootMiddleware, "utf8")).rejects.toThrow();
  });

  it("uses a config.matcher that excludes public routes", async () => {
    const source = await readMiddlewareSource();
    // Must export a `config` object with a `matcher` array.
    expect(source).toMatch(/export const config\s*=/);
    expect(source).toMatch(/matcher\s*:/);
    // Negative-lookahead pattern is the documented standard for excluding
    // public routes. We assert the standard pattern is present.
    expect(source).toMatch(/\(\?\!.*login.*registro.*doctores/);
  });

  it("wires buildProtectedRouteHandler with the auth() wrapper", async () => {
    const source = await readMiddlewareSource();
    expect(source).toContain(
      'import { auth } from "@/auth"',
    );
    expect(source).toContain(
      'import { buildProtectedRouteHandler } from "@/lib/auth/protected-route-handler"',
    );
    expect(source).toContain("buildProtectedRouteHandler((r) => !!r.auth)");
  });
});
