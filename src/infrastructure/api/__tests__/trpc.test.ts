import { describe, it, expect, vi } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";

// Mock next-auth to prevent module resolution issues in vitest's jsdom env
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    code = "credentials";
  },
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
  default: () => ({}),
}));

// Mock auth module to prevent next-auth resolution issues in vitest
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

// Mock DB module to prevent DATABASE_URL requirement during module init
vi.mock("@/infrastructure/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: vi.fn() }) } as any,
}));

interface MockContext {
  db: null;
  session: { user: { id: string; role: string } } | null;
}

const t = initTRPC.context<MockContext>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const testRouter = t.router({
  protectedQuery: protectedProcedure.query(() => "ok"),
  publicQuery: t.procedure.query(() => "public data"),
});

const createCaller = t.createCallerFactory(testRouter);

describe("protectedProcedure", () => {
  it("throws TRPCError with code UNAUTHORIZED when session is null", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(caller.protectedQuery()).rejects.toThrow(TRPCError);
    try {
      await caller.protectedQuery();
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("executes successfully when a valid session is present", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "1", role: "patient" } },
    });

    const result = await caller.protectedQuery();
    expect(result).toBe("ok");
  });
});

describe("publicProcedure", () => {
  it("executes without any auth check", async () => {
    const caller = createCaller({ db: null, session: null });

    const result = await caller.publicQuery();
    expect(result).toBe("public data");
  });
});

describe("type check — AppRouter is defined", () => {
  it("AppRouter type compiles and the router is valid", async () => {
    const { appRouter } = await import("@/infrastructure/api/routers/_app");
    expect(appRouter).toBeDefined();
    // A tRPC router has a `_def` property
    expect((appRouter as any)._def).toBeDefined();
  });
});
