import { describe, expect, it } from "vitest";
import { AuditLog } from "../audit-log";

describe("AuditLog", () => {
  it("creates with valid props", () => {
    const log = AuditLog.create({
      usuarioId: "user-uuid",
      accion: "LOGIN",
      entidadAfectada: "Usuario",
      entidadId: "user-uuid",
      direccionIP: "192.168.1.1",
    });

    expect(log.id).toBeTruthy();
    expect(log.usuarioId).toBe("user-uuid");
    expect(log.accion).toBe("LOGIN");
    expect(log.entidadAfectada).toBe("Usuario");
    expect(log.entidadId).toBe("user-uuid");
    expect(log.detalles).toBeNull();
    expect(log.direccionIP).toBe("192.168.1.1");
    expect(log.createdAt).toBeInstanceOf(Date);
    // createdAt should be very recent
    expect(log.createdAt.getTime()).toBeCloseTo(Date.now(), -3);
  });

  it("accepts optional detalles as JSON", () => {
    const log = AuditLog.create({
      usuarioId: "user-uuid",
      accion: "UPDATE_PROFILE",
      entidadAfectada: "Usuario",
      entidadId: "user-uuid",
      detalles: { campo: "email", valorAnterior: "old@test.com", valorNuevo: "new@test.com" },
      direccionIP: "10.0.0.1",
    });

    expect(log.detalles).toEqual({
      campo: "email",
      valorAnterior: "old@test.com",
      valorNuevo: "new@test.com",
    });
  });

  it("trims whitespace from string fields", () => {
    const log = AuditLog.create({
      usuarioId: "  user-uuid  ",
      accion: "  LOGOUT  ",
      entidadAfectada: "  Sesión  ",
      entidadId: "  session-id  ",
      direccionIP: "  192.168.1.1  ",
    });

    expect(log.usuarioId).toBe("user-uuid");
    expect(log.accion).toBe("LOGOUT");
    expect(log.entidadAfectada).toBe("Sesión");
    expect(log.entidadId).toBe("session-id");
    expect(log.direccionIP).toBe("192.168.1.1");
  });

  it("rejects empty usuarioId", () => {
    expect(() =>
      AuditLog.create({
        usuarioId: "",
        accion: "LOGIN",
        entidadAfectada: "Usuario",
        entidadId: "uuid",
        direccionIP: "127.0.0.1",
      }),
    ).toThrow("usuarioId is required");
  });

  it("rejects empty accion", () => {
    expect(() =>
      AuditLog.create({
        usuarioId: "uuid",
        accion: "",
        entidadAfectada: "Usuario",
        entidadId: "uuid",
        direccionIP: "127.0.0.1",
      }),
    ).toThrow("accion is required");
  });

  it("rejects empty entidadAfectada", () => {
    expect(() =>
      AuditLog.create({
        usuarioId: "uuid",
        accion: "LOGIN",
        entidadAfectada: "",
        entidadId: "uuid",
        direccionIP: "127.0.0.1",
      }),
    ).toThrow("entidadAfectada is required");
  });

  it("rejects empty entidadId", () => {
    expect(() =>
      AuditLog.create({
        usuarioId: "uuid",
        accion: "LOGIN",
        entidadAfectada: "Usuario",
        entidadId: "",
        direccionIP: "127.0.0.1",
      }),
    ).toThrow("entidadId is required");
  });

  it("rejects empty direccionIP", () => {
    expect(() =>
      AuditLog.create({
        usuarioId: "uuid",
        accion: "LOGIN",
        entidadAfectada: "Usuario",
        entidadId: "uuid",
        direccionIP: "",
      }),
    ).toThrow("direccionIP is required");
  });

  it("generates unique ids", () => {
    const a = AuditLog.create({
      usuarioId: "u1",
      accion: "LOGIN",
      entidadAfectada: "Usuario",
      entidadId: "u1",
      direccionIP: "10.0.0.1",
    });
    const b = AuditLog.create({
      usuarioId: "u2",
      accion: "LOGOUT",
      entidadAfectada: "Usuario",
      entidadId: "u2",
      direccionIP: "10.0.0.2",
    });
    expect(a.id).not.toBe(b.id);
  });
});
