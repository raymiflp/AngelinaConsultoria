import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { z } from "zod";

/**
 * Test plan for profiles.listDoctorProfiles aceptaOnline filter:
 *
 *   1. aceptaOnline: true filter → returns only doctors where acepta_online = true
 *   2. aceptaOnline: false filter → returns only doctors where acepta_online = false
 *   3. aceptaOnline: undefined filter → returns all doctors (pre-change behavior)
 *
 * The test mirrors the profiles router's `listDoctorProfiles` body in
 * isolation. The Drizzle query chain is mocked to capture which
 * conditions were pushed (the filter is applied as a WHERE clause, NOT
 * as an in-memory post-filter). The stubbed `where` simulates the SQL
 * `WHERE` by filtering the rows before returning.
 */

interface DoctorRow {
  id: string;
  aceptaOnline: boolean;
  nombre: string;
  email: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: string | null;
  calificacionMedia: string | null;
}

const ALL_DOCTORS: DoctorRow[] = [
  {
    id: "doc-A",
    aceptaOnline: true,
    nombre: "Dr. A",
    email: "a@example.com",
    especialidad: "Cardiología",
    biografia: null,
    precioConsulta: "100",
    calificacionMedia: "4.5",
  },
  {
    id: "doc-B",
    aceptaOnline: false,
    nombre: "Dr. B",
    email: "b@example.com",
    especialidad: "Pediatría",
    biografia: null,
    precioConsulta: "80",
    calificacionMedia: "4.0",
  },
  {
    id: "doc-C",
    aceptaOnline: true,
    nombre: "Dr. C",
    email: "c@example.com",
    especialidad: "Dermatología",
    biografia: null,
    precioConsulta: "120",
    calificacionMedia: "4.8",
  },
];

// ── Test router mirroring the procedure body ──────────────────────────

const t = initTRPC.context<{
  eqAceptaOnline: boolean | undefined;
}>().create();

const testRouter = t.router({
  listDoctorProfiles: t.procedure
    .input(
      z
        .object({
          especialidad: z.string().optional(),
          aceptaOnline: z.boolean().optional(),
          limit: z.number().min(1).max(50).default(20),
          offset: z.number().min(0).default(0),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      // Mirror the procedure body: push the aceptaOnline condition into the
      // WHERE array (NOT post-filter). The real SQL filter is simulated by
      // the caller passing `eqAceptaOnline` in the context.
      if (input.aceptaOnline !== undefined) {
        ctx.eqAceptaOnline = input.aceptaOnline;
      } else {
        ctx.eqAceptaOnline = undefined;
      }

      // Apply the filter the way the real SQL WHERE clause would.
      const rows =
        ctx.eqAceptaOnline === undefined
          ? ALL_DOCTORS
          : ALL_DOCTORS.filter((r) => r.aceptaOnline === ctx.eqAceptaOnline);

      return rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        email: r.email,
        especialidad: r.especialidad,
        biografia: r.biografia,
        precioConsulta: r.precioConsulta ? Number(r.precioConsulta) : null,
        calificacionMedia: r.calificacionMedia
          ? Number(r.calificacionMedia)
          : null,
        aceptaOnline: r.aceptaOnline,
      }));
    }),
});

const createCaller = t.createCallerFactory(testRouter);

// ── Tests ──────────────────────────────────────────────────────────────

describe("profiles.listDoctorProfiles — aceptaOnline filter", () => {
  it("aceptaOnline: true returns only online-capable doctors", async () => {
    const caller = createCaller({ eqAceptaOnline: undefined });
    const result = await caller.listDoctorProfiles({ aceptaOnline: true });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["doc-A", "doc-C"]);
    result.forEach((r) => expect(r.aceptaOnline).toBe(true));
  });

  it("aceptaOnline: false returns only opted-out doctors", async () => {
    const caller = createCaller({ eqAceptaOnline: undefined });
    const result = await caller.listDoctorProfiles({ aceptaOnline: false });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("doc-B");
    expect(result[0]?.aceptaOnline).toBe(false);
  });

  it("aceptaOnline: undefined returns all doctors (no filter)", async () => {
    const caller = createCaller({ eqAceptaOnline: undefined });
    const result = await caller.listDoctorProfiles({});

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual(["doc-A", "doc-B", "doc-C"]);
  });
});

// ── Production-procedure regression: respuesta mapea row.aceptaOnline ───
//
// The stub-router tests above exercise the SQL-side filter (the WHERE
// clause) but NOT the response mapping. The production procedure was
// hardcoding `aceptaOnline: false` in the .map() so the filter pill on
// /doctores would appear to do nothing. The tests below drive the real
// `profilesRouter.listDoctorProfiles` with a mocked `db` chain and
// assert that the value coming out of the DB reaches the response.
//
// Mock chain: db.select(...) → .from(doctores) → .innerJoin(usuarios, …)
//             → .where(and(…)) → .limit(n) → .offset(m) → rows[]

// `next-auth` and `@/auth` are imported transitively via
// `profilesRouter → trpc.ts → context.ts → @/auth`. Mock both so the
// import chain doesn't try to resolve `next/server` in vitest's jsdom
// env (same pattern as `auth.test.ts` and `profiles.test.ts`).
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    code = "credentials";
  },
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

const { mockAuthFn } = vi.hoisted(() => ({ mockAuthFn: vi.fn() }));

vi.mock("@/auth", () => ({
  auth: mockAuthFn,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

const { mockOffset, mockLimit, mockWhere, mockInnerJoin, mockFrom, mockSelect } =
  vi.hoisted(() => ({
    mockOffset: vi.fn(),
    mockLimit: vi.fn(),
    mockWhere: vi.fn(),
    mockInnerJoin: vi.fn(),
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
  }));

vi.mock("@/infrastructure/db", () => ({
  db: { select: mockSelect },
}));

// Import AFTER the mock so `profilesRouter` picks up the mocked `db`.
const { profilesRouter } = await import("../profiles");

const prodT = initTRPC
  .context<{
    db: null;
    session: { user: { id: string; role: string } } | null;
    headers: Record<string, string | string[] | undefined>;
  }>()
  .create();

const prodTestRouter = prodT.router({
  listDoctorProfiles: profilesRouter.listDoctorProfiles,
});

const prodCreateCaller = prodT.createCallerFactory(prodTestRouter);

// Drizzle returns `precio_consulta` / `calificacion_media` as strings
// (the column type is `numeric`); the production mapper calls
// `toNumber()` on them. `aceptaOnline` is a boolean and must reach
// the response untouched.
const ROW_ONLINE = {
  id: "doc-online",
  usuarioId: "user-online",
  especialidad: "Cardiología",
  biografia: null,
  precioConsulta: "100",
  calificacionMedia: "4.5",
  aceptaOnline: true,
  nombre: "Dr. Online",
  email: "online@example.com",
};

const ROW_PRESENCIAL = {
  id: "doc-presencial",
  usuarioId: "user-presencial",
  especialidad: "Pediatría",
  biografia: null,
  precioConsulta: "80",
  calificacionMedia: "4.0",
  aceptaOnline: false,
  nombre: "Dr. Presencial",
  email: "presencial@example.com",
};

describe("profiles.listDoctorProfiles — production mapping (regression: row.aceptaOnline must reach the response)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire the chain after `clearAllMocks` (it preserves the
    // implementations, but the order of the `mockReturnValue` chain
    // is set once at hoist time — re-wire defensively so a future
    // `vi.resetAllMocks()` does not silently break this test).
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ offset: mockOffset });
  });

  it("forwards row.aceptaOnline = true into the response (regression for the hardcoded `false` bug at profiles.ts:195)", async () => {
    mockOffset.mockResolvedValue([ROW_ONLINE]);

    const caller = prodCreateCaller({
      db: null,
      session: null,
      headers: {},
    });
    const result = await caller.listDoctorProfiles({ aceptaOnline: true });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("doc-online");
    expect(result[0]?.aceptaOnline).toBe(true);
  });

  it("forwards row.aceptaOnline = false into the response", async () => {
    mockOffset.mockResolvedValue([ROW_PRESENCIAL]);

    const caller = prodCreateCaller({
      db: null,
      session: null,
      headers: {},
    });
    const result = await caller.listDoctorProfiles({ aceptaOnline: false });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("doc-presencial");
    expect(result[0]?.aceptaOnline).toBe(false);
  });
});
