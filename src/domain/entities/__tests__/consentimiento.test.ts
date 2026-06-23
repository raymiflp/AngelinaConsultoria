import { describe, expect, it } from "vitest";
import { Consentimiento } from "../consentimiento";

describe("Consentimiento", () => {
  it("creates a not-accepted consent without dates", () => {
    const c = Consentimiento.create({
      usuarioId: "user-uuid",
      tipo: "data_processing",
      version: "1.0",
      aceptado: false,
    });

    expect(c.id).toBeTruthy();
    expect(c.usuarioId).toBe("user-uuid");
    expect(c.tipo).toBe("data_processing");
    expect(c.version).toBe("1.0");
    expect(c.aceptado).toBe(false);
    expect(c.fechaAceptacion).toBeUndefined();
    expect(c.fechaExpiracion).toBeUndefined();
  });

  it("creates an accepted consent with fechaAceptacion", () => {
    const now = new Date();
    const c = Consentimiento.create({
      usuarioId: "user-uuid",
      tipo: "communication",
      version: "2.0",
      aceptado: true,
      fechaAceptacion: now,
    });

    expect(c.aceptado).toBe(true);
    expect(c.fechaAceptacion).toBe(now);
  });

  it("creates consent with expiration date", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const c = Consentimiento.create({
      usuarioId: "user-uuid",
      tipo: "data_processing",
      version: "1.0",
      aceptado: true,
      fechaAceptacion: now,
      fechaExpiracion: later,
    });

    expect(c.fechaExpiracion).toBe(later);
  });

  it("rejects aceptado=true without fechaAceptacion", () => {
    expect(() =>
      Consentimiento.create({
        usuarioId: "user-uuid",
        tipo: "data_processing",
        version: "1.0",
        aceptado: true,
      }),
    ).toThrow("fechaAceptacion is required when aceptado is true");
  });

  it("rejects fechaExpiracion before fechaAceptacion", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000);

    expect(() =>
      Consentimiento.create({
        usuarioId: "user-uuid",
        tipo: "data_processing",
        version: "1.0",
        aceptado: true,
        fechaAceptacion: now,
        fechaExpiracion: earlier,
      }),
    ).toThrow("fechaExpiracion must be after fechaAceptacion");
  });

  it("rejects equal fechaAceptacion and fechaExpiracion", () => {
    const now = new Date();

    expect(() =>
      Consentimiento.create({
        usuarioId: "user-uuid",
        tipo: "data_processing",
        version: "1.0",
        aceptado: true,
        fechaAceptacion: now,
        fechaExpiracion: now,
      }),
    ).toThrow("fechaExpiracion must be after fechaAceptacion");
  });

  it("rejects empty tipo", () => {
    expect(() =>
      Consentimiento.create({
        usuarioId: "uuid",
        tipo: "",
        version: "1.0",
        aceptado: false,
      }),
    ).toThrow("tipo is required");
  });

  it("rejects empty version", () => {
    expect(() =>
      Consentimiento.create({
        usuarioId: "uuid",
        tipo: "data_processing",
        version: "",
        aceptado: false,
      }),
    ).toThrow("version is required");
  });

  it("generates unique ids", () => {
    const a = Consentimiento.create({
      usuarioId: "u1",
      tipo: "data_processing",
      version: "1.0",
      aceptado: false,
    });
    const b = Consentimiento.create({
      usuarioId: "u2",
      tipo: "communication",
      version: "1.0",
      aceptado: false,
    });
    expect(a.id).not.toBe(b.id);
  });
});
