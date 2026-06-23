import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to avoid hoisting issues with vi.mock
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: mockAuth,
}));

// Mock the DB module so tests don't need DATABASE_URL or a real connection.
vi.mock("@/infrastructure/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: vi.fn() }) } as any,
}));

import { createContext } from "../context";

describe("createContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with a db property typed as a Drizzle instance", async () => {
    mockAuth.mockResolvedValue(null);
    const ctx = await createContext();
    expect(ctx).toHaveProperty("db");
    expect(typeof ctx.db.select).toBe("function");
  });

  it("has session set to null when auth() returns no session", async () => {
    mockAuth.mockResolvedValue(null);
    const ctx = await createContext();
    expect(ctx.session).toBeNull();
  });

  it("has session with user data when auth() returns a valid session", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "PACIENTE",
      },
      expires: "2025-01-01T00:00:00.000Z",
    });

    const ctx = await createContext();
    expect(ctx.session).not.toBeNull();
    expect(ctx.session?.user.id).toBe("user-1");
    expect(ctx.session?.user.role).toBe("PACIENTE");
    expect(ctx.session?.user.email).toBe("test@example.com");
    expect(ctx.session?.user.name).toBe("Test User");
  });

  it("calls auth() to resolve the session", async () => {
    mockAuth.mockResolvedValue(null);
    await createContext();
    expect(mockAuth).toHaveBeenCalledOnce();
  });
});
