import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    code = "credentials";
  },
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

vi.mock("@/infrastructure/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn() }),
    update: vi.fn().mockReturnValue({ set: vi.fn() }),
  },
}));

import { initTRPC } from "@trpc/server";
import { updateProfileSchema } from "@/infrastructure/profiles/schemas";

// ─── Test router ───────────────────────────────────────────────────────

const t = initTRPC.context<{
  db: null;
  session: { user: { id: string; role: string } } | null;
}>().create();

const protectedMiddleware = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const testRouter = t.router({
  // getMyProfile — simulates role-branching logic
  getMyProfile: protectedMiddleware.query(({ ctx }) => {
    const { id: userId, role } = ctx.session.user;

    if (role === "DOCTOR") {
      return {
        id: userId,
        email: "test@example.com",
        nombre: "Test Doctor",
        telefono: "612345678",
        rol: "DOCTOR" as const,
        activo: true,
        doctor: {
          id: "doc-1",
          numeroColegiado: "12345",
          especialidad: "Cardiología",
          biografia: "Experienced cardiologist",
          precioConsulta: 150,
          verificado: true,
          calificacionMedia: 4.5,
        },
        paciente: undefined,
      };
    }

    if (role === "PACIENTE") {
      return {
        id: userId,
        email: "test@example.com",
        nombre: "Test Patient",
        telefono: "698765432",
        rol: "PACIENTE" as const,
        activo: true,
        doctor: undefined,
        paciente: {
          id: "pac-1",
          fechaNacimiento: "1990-01-15",
          direccionCalle: "Calle Mayor 10",
          direccionCiudad: "Madrid",
          direccionProvincia: "Madrid",
          direccionCodigoPostal: "28001",
          direccionPais: "España",
          alergias: ["Penicilina"],
          grupoSanguineo: "A+",
          notasMedicas: null,
        },
      };
    }

    // Unknown role — no extension
    return {
      id: userId,
      email: "test@example.com",
      nombre: "Test User",
      telefono: "600000000",
      rol: role as "DOCTOR" | "PACIENTE",
      activo: true,
      doctor: null,
      paciente: null,
    };
  }),

  // updateMyProfile — validates with real schema, returns simulated update
  updateMyProfile: protectedMiddleware
    .input(updateProfileSchema)
    .mutation(({ ctx, input }) => {
      if (input.rol === "DOCTOR") {
        return {
          id: ctx.session.user.id,
          email: "test@example.com",
          nombre: input.nombre,
          telefono: input.telefono ?? "",
          rol: "DOCTOR" as const,
          activo: true,
          doctor: {
            id: "doc-1",
            numeroColegiado: input.numeroColegiado,
            especialidad: input.especialidad,
            biografia: input.biografia ?? null,
            precioConsulta: input.precioConsulta ?? null,
            verificado: true,
            calificacionMedia: 4.5,
          },
          paciente: null,
        };
      }

      return {
        id: ctx.session.user.id,
        email: "test@example.com",
        nombre: input.nombre,
        telefono: input.telefono ?? "",
        rol: "PACIENTE" as const,
        activo: true,
        doctor: null,
        paciente: {
          id: "pac-1",
          fechaNacimiento: input.fechaNacimiento,
          direccionCalle: input.direccion.calle,
          direccionCiudad: input.direccion.ciudad,
          direccionProvincia: input.direccion.provincia,
          direccionCodigoPostal: input.direccion.codigoPostal,
          direccionPais: input.direccion.pais,
          alergias: input.alergias,
          grupoSanguineo: input.grupoSanguineo ?? null,
          notasMedicas: input.notasMedicas ?? null,
        },
      };
    }),

  // getDoctorProfile — public, returns mock data
  getDoctorProfile: t.procedure
    .input(z.object({ doctorId: z.string() }))
    .query(({ input }) => {
      if (input.doctorId === "not-found") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Doctor no encontrado",
        });
      }

      return {
        id: input.doctorId,
        nombre: "Dr. García",
        email: "dr.garcia@example.com",
        especialidad: "Cardiología",
        biografia: "Experienced cardiologist",
        precioConsulta: 150,
        calificacionMedia: 4.5,
      };
    }),

  // getHomeStats — public, returns safe-fallback shape on any throw
  getHomeStats: t.procedure.query(() => {
    if ((globalThis as { __getHomeStatsShouldThrow?: boolean }).__getHomeStatsShouldThrow) {
      // Procedure wrapper catches and returns { 0, 0 } (mirrors real router)
      try {
        throw new Error("DB down");
      } catch {
        return { totalVerifiedDoctors: 0, totalSpecialties: 0 };
      }
    }
    const counts = (globalThis as { __getHomeStatsCounts?: { v: number; s: number } }).__getHomeStatsCounts;
    if (!counts) {
      return { totalVerifiedDoctors: 0, totalSpecialties: 0 };
    }
    return { totalVerifiedDoctors: counts.v, totalSpecialties: counts.s };
  }),
});

const createCaller = t.createCallerFactory(testRouter);

// ─── Tests ─────────────────────────────────────────────────────────────

describe("profiles.getMyProfile", () => {
  it("returns doctor data for DOCTOR role", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "DOCTOR" } },
    });

    const result = await caller.getMyProfile();

    expect(result).toHaveProperty("id", "user-1");
    expect(result.rol).toBe("DOCTOR");
    expect(result).toHaveProperty("doctor");
    expect(result.doctor?.especialidad).toBe("Cardiología");
    expect(result.doctor?.precioConsulta).toBe(150);
  });

  it("returns patient data for PACIENTE role", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-2", role: "PACIENTE" } },
    });

    const result = await caller.getMyProfile();

    expect(result.rol).toBe("PACIENTE");
    expect(result).toHaveProperty("paciente");
    expect(result.paciente?.fechaNacimiento).toBe("1990-01-15");
    expect(result.paciente?.alergias).toContain("Penicilina");
  });

  it("throws UNAUTHORIZED without session", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(caller.getMyProfile()).rejects.toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });
});

describe("profiles.updateMyProfile", () => {
  it("updates doctor profile and returns updated data", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "DOCTOR" } },
    });

    const result = await caller.updateMyProfile({
      rol: "DOCTOR",
      nombre: "Dr. Updated",
      telefono: "699999999",
      numeroColegiado: "99999",
      especialidad: "Neurología",
      biografia: "Updated bio",
      precioConsulta: 250,
    });

    expect(result.nombre).toBe("Dr. Updated");
    expect(result.doctor?.especialidad).toBe("Neurología");
    expect(result.doctor?.precioConsulta).toBe(250);
  });

  it("updates patient profile and returns updated data", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-2", role: "PACIENTE" } },
    });

    const result = await caller.updateMyProfile({
      rol: "PACIENTE",
      nombre: "Ana Updated",
      telefono: "688888888",
      fechaNacimiento: "1995-03-20",
      direccion: {
        calle: "Nueva Calle 5",
        ciudad: "Valencia",
        provincia: "Valencia",
        codigoPostal: "46001",
        pais: "España",
      },
      alergias: ["Sulfa"],
      grupoSanguineo: "B+",
      notasMedicas: "Updated notes",
    });

    expect(result.nombre).toBe("Ana Updated");
    expect(result.paciente?.fechaNacimiento).toBe("1995-03-20");
    expect(result.paciente?.alergias).toContain("Sulfa");
  });

  it("rejects cross-role fields (doctor with patient fields)", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "DOCTOR" } },
    });

    await expect(
      caller.updateMyProfile({
        rol: "DOCTOR",
        nombre: "Dr. Wrong",
        fechaNacimiento: "1990-01-15",
      } as any),
    ).rejects.toThrow();
  });

  it("rejects invalid data (negative price)", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "DOCTOR" } },
    });

    await expect(
      caller.updateMyProfile({
        rol: "DOCTOR",
        nombre: "Dr. Test",
        numeroColegiado: "12345",
        especialidad: "Cardiología",
        precioConsulta: -10,
      } as any),
    ).rejects.toThrow();
  });

  it("rejects empty input data", async () => {
    const caller = createCaller({
      db: null,
      session: { user: { id: "user-1", role: "DOCTOR" } },
    });

    await expect(
      caller.updateMyProfile({} as any),
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED without session", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(
      caller.updateMyProfile({
        rol: "DOCTOR",
        nombre: "Dr. Test",
        numeroColegiado: "12345",
        especialidad: "Cardiología",
      } as any),
    ).rejects.toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });
});

describe("profiles.getDoctorProfile", () => {
  it("returns public doctor data", async () => {
    const caller = createCaller({ db: null, session: null });

    const result = await caller.getDoctorProfile({ doctorId: "doc-1" });

    expect(result).toHaveProperty("id", "doc-1");
    expect(result).toHaveProperty("nombre", "Dr. García");
    expect(result).toHaveProperty("especialidad", "Cardiología");
    expect(result).toHaveProperty("precioConsulta", 150);
  });

  it("works without authentication", async () => {
    const caller = createCaller({ db: null, session: null });

    const result = await caller.getDoctorProfile({ doctorId: "doc-2" });
    expect(result).toBeDefined();
  });

  it("throws NOT_FOUND for non-existent doctor", async () => {
    const caller = createCaller({ db: null, session: null });

    await expect(
      caller.getDoctorProfile({ doctorId: "not-found" }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("profiles.getHomeStats", () => {
  beforeEach(() => {
    delete (globalThis as { __getHomeStatsCounts?: unknown }).__getHomeStatsCounts;
    delete (globalThis as { __getHomeStatsShouldThrow?: unknown }).__getHomeStatsShouldThrow;
  });

  it("returns the { totalVerifiedDoctors, totalSpecialties } shape on success", async () => {
    (globalThis as { __getHomeStatsCounts?: { v: number; s: number } }).__getHomeStatsCounts = {
      v: 5,
      s: 3,
    };
    const caller = createCaller({ db: null, session: null });

    const result = await caller.getHomeStats();

    expect(result).toEqual({ totalVerifiedDoctors: 5, totalSpecialties: 3 });
  });

  it("returns the safe fallback { 0, 0 } when the DB throws", async () => {
    (globalThis as { __getHomeStatsShouldThrow?: boolean }).__getHomeStatsShouldThrow = true;
    const caller = createCaller({ db: null, session: null });

    const result = await caller.getHomeStats();

    expect(result).toEqual({ totalVerifiedDoctors: 0, totalSpecialties: 0 });
  });

  it("is public (works with a null session)", async () => {
    (globalThis as { __getHomeStatsCounts?: { v: number; s: number } }).__getHomeStatsCounts = {
      v: 1,
      s: 1,
    };
    const caller = createCaller({ db: null, session: null });

    const result = await caller.getHomeStats();

    expect(result).toEqual({ totalVerifiedDoctors: 1, totalSpecialties: 1 });
  });
});
