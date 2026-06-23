/**
 * Integration test setup.
 *
 * Mocks Next.js-specific modules that would fail in a "node" environment.
 * The tests themselves use `describe.skipIf` to skip when no database URL
 * is configured — no file-level guard needed here.
 */

import { beforeAll, afterAll, beforeEach, vi } from "vitest";

// ── Mocks for Node environment ──────────────────────────────────────────
// The use cases reach @/application → @/auth → @/infrastructure/db, which
// throws if DATABASE_URL is not set. We mock auth and Next.js modules to
// keep the module resolution chain loadable.

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    signIn: () => null,
    signOut: () => null,
    handlers: {},
  }),
  AuthError: class AuthError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "AuthError";
    }
  },
}));

vi.mock("next/server", () => ({
  NextRequest: class NextRequest {
    public url: string;
    constructor(input: string | URL) {
      this.url = input instanceof URL ? input.href : input;
    }
  },
  NextResponse: {
    json: (body: unknown) => ({ status: 200, body }),
    next: () => ({ status: 200 }),
    redirect: (url: string) => ({ status: 302, url }),
  },
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
  }),
  headers: () => new Map(),
}));

// Mock @/auth to prevent it from loading @/infrastructure/db at module level
vi.mock("@/auth", () => ({
  auth: () => Promise.resolve(null),
  signIn: () => Promise.resolve({ error: "Mocked" }),
  signOut: () => Promise.resolve({}),
  handlers: {
    GET: () => new Response(null, { status: 200 }),
    POST: () => new Response(null, { status: 200 }),
  },
}));

// ── Lifecycle hooks ─────────────────────────────────────────────────────
// Note: setup.ts runs BEFORE the test file. The `describe.skipIf` guard
// in the test file prevents any db operations when there's no database URL.

const HAS_DB_URL =
  typeof process.env.TEST_DATABASE_URL === "string" ||
  typeof process.env.DATABASE_URL === "string";

beforeAll(async () => {
  if (!HAS_DB_URL) return;

  const { getDb } = await import("./helpers/db");
  // Initialise the connection eagerly so any connection failure is
  // surfaced before the first test runs (fail-fast).
  getDb();
});

beforeEach(async () => {
  if (!HAS_DB_URL) return;

  const { resetDb } = await import("./helpers/db");
  await resetDb();
});

afterAll(async () => {
  if (!HAS_DB_URL) return;

  const { closeDb } = await import("./helpers/db");
  await closeDb();
});
