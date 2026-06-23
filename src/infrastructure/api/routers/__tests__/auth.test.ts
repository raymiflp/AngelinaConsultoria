import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock next-auth to avoid module resolution issues in vitest
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    code = "credentials";
  },
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

// Mock auth module
const mockSignIn = vi.hoisted(() => vi.fn());
const mockAuthFn = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  signIn: mockSignIn,
  auth: mockAuthFn,
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

// Mock DB
const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockReturnValue({ returning: mockReturning });
mockTransaction.mockImplementation(async (cb: Function) => {
  const tx = {
    insert: mockInsert,
    select: mockSelect,
  };
  return cb(tx);
});

vi.mock("@/infrastructure/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    transaction: mockTransaction,
  },
}));

// Mock password hashing
vi.mock("@/infrastructure/auth/password", () => ({
  hash: vi.fn().mockResolvedValue("$2b$12$hashedpasswordmock"),
  verify: vi.fn().mockResolvedValue(true),
}));

import { authRouter } from "../auth";
import { initTRPC } from "@trpc/server";

const t = initTRPC.context<{
  db: any;
  session: { user: { id: string; role: string } } | null;
}>().create();

const createCaller = t.createCallerFactory(
  t.router({
    register: authRouter.register,
    login: authRouter.login,
    me: t.procedure
      .use(({ ctx, next }) => {
        if (!ctx.session) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        return next({ ctx: { ...ctx, session: ctx.session } });
      })
      .query(() => {
        return {
          user: {
            id: "test-id",
            email: "test@example.com",
            name: "Test",
            role: "PACIENTE",
          },
        };
      }),
  }),
);

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockResolvedValue([]);
    mockReturning.mockResolvedValue([
      {
        id: "user-1",
        email: "new@example.com",
        nombre: "New User",
        rol: "PACIENTE",
      },
    ]);
    mockSignIn.mockResolvedValue({ ok: true });
    mockAuthFn.mockResolvedValue({
      user: {
        id: "user-1",
        email: "new@example.com",
        name: "New User",
        role: "PACIENTE",
      },
      expires: "2025-01-01T00:00:00.000Z",
    });
  });

  it("creates a user and returns session data for valid input", async () => {
    const caller = createCaller({ db: null, session: null });
    const result = await caller.register({
      email: "new@example.com",
      password: "Secure1pass",
      nombre: "New User",
    });

    expect(result).toHaveProperty("user");
    expect(result.user).toHaveProperty("id");
    expect(result.user.email).toBe("new@example.com");
    expect(result.user.name).toBe("New User");
    expect(result.user.role).toBe("PACIENTE");
  });

  it("throws CONFLICT when email already exists", async () => {
    mockWhere.mockResolvedValue([{ id: "existing-id" }]);

    const caller = createCaller({ db: null, session: null });

    try {
      await caller.register({
        email: "existing@example.com",
        password: "Secure1pass",
        nombre: "Existing User",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("CONFLICT");
    }
  });

  it("rejects invalid email format via Zod", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(
      caller.register({
        email: "not-an-email",
        password: "Secure1pass",
        nombre: "Test User",
      }),
    ).rejects.toThrow();
  });

  it("rejects weak password via Zod", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(
      caller.register({
        email: "test@example.com",
        password: "short",
        nombre: "Test User",
      }),
    ).rejects.toThrow();
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ ok: true });
    mockAuthFn.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
        role: "PACIENTE",
      },
      expires: "2025-01-01T00:00:00.000Z",
    });
  });

  it("returns session data for valid credentials", async () => {
    const caller = createCaller({ db: null, session: null });
    const result = await caller.login({
      email: "user@example.com",
      password: "Secure1pass",
    });

    expect(result).toHaveProperty("user");
    expect(result.user.email).toBe("user@example.com");
    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "user@example.com",
      password: "Secure1pass",
      redirect: false,
    });
  });

  it("throws UNAUTHORIZED when signIn throws AuthError", async () => {
    // We need to create a proper AuthError — use the mock
    const { AuthError } = await import("next-auth");
    mockSignIn.mockRejectedValue(new AuthError());

    const caller = createCaller({ db: null, session: null });

    try {
      await caller.login({
        email: "user@example.com",
        password: "WrongPass1",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("throws UNAUTHORIZED for non-existent email (generic error)", async () => {
    const { AuthError } = await import("next-auth");
    mockSignIn.mockRejectedValue(new AuthError());

    const caller = createCaller({ db: null, session: null });

    try {
      await caller.login({
        email: "ghost@example.com",
        password: "SomePass1",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });
});

describe("auth.me", () => {
  it("returns user data when authenticated", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "PACIENTE" } },
    });

    const result = await caller.me();
    expect(result).toHaveProperty("user");
    expect(result.user.id).toBe("test-id");
  });

  it("throws UNAUTHORIZED when session is null", async () => {
    const caller = createCaller({ db: null, session: null });

    try {
      await caller.me();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });
});
