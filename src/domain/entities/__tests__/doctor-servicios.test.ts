import { describe, expect, it } from "vitest";
import { DoctorService } from "../doctor-servicios";

describe("DoctorService", () => {
  it("creates with valid props", () => {
    const service = DoctorService.create({
      doctorId: "doc-1",
      nombre: "Consulta online",
      precio: 40,
      duracionMinutos: 30,
      descripcion: "Consulta médica por videollamada",
      orden: 1,
    });

    expect(service.id).toBeTruthy();
    expect(service.doctorId).toBe("doc-1");
    expect(service.nombre).toBe("Consulta online");
    expect(service.precio).toBe(40);
    expect(service.duracionMinutos).toBe(30);
    expect(service.descripcion).toBe("Consulta médica por videollamada");
    expect(service.activo).toBe(true);
    expect(service.orden).toBe(1);
  });

  it("defaults activo to true and orden to 0", () => {
    const service = DoctorService.create({
      doctorId: "doc-1",
      nombre: "Consulta básica",
      precio: 50,
    });

    expect(service.activo).toBe(true);
    expect(service.orden).toBe(0);
    expect(service.descripcion).toBeUndefined();
    expect(service.duracionMinutos).toBeUndefined();
  });

  it("accepts activo false", () => {
    const service = DoctorService.create({
      doctorId: "doc-1",
      nombre: "Servicio inactivo",
      precio: 30,
      activo: false,
    });

    expect(service.activo).toBe(false);
  });

  it("rejects empty nombre", () => {
    expect(() =>
      DoctorService.create({
        doctorId: "doc-1",
        nombre: "",
        precio: 50,
      }),
    ).toThrow("Nombre is required");
  });

  it("rejects precio <= 0", () => {
    expect(() =>
      DoctorService.create({
        doctorId: "doc-1",
        nombre: "Consulta",
        precio: 0,
      }),
    ).toThrow("Precio must be greater than 0");

    expect(() =>
      DoctorService.create({
        doctorId: "doc-1",
        nombre: "Consulta",
        precio: -10,
      }),
    ).toThrow("Precio must be greater than 0");
  });

  it("trims whitespace from string fields", () => {
    const service = DoctorService.create({
      doctorId: "doc-1",
      nombre: "  Consulta online  ",
      precio: 40,
      descripcion: "  Descripción con espacios  ",
    });

    expect(service.nombre).toBe("Consulta online");
    expect(service.descripcion).toBe("Descripción con espacios");
  });

  it("generates unique ids", () => {
    const a = DoctorService.create({
      doctorId: "doc-1",
      nombre: "Servicio A",
      precio: 30,
    });
    const b = DoctorService.create({
      doctorId: "doc-1",
      nombre: "Servicio B",
      precio: 50,
    });

    expect(a.id).not.toBe(b.id);
  });
});
