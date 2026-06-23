import { describe, expect, it } from "vitest";
import { Doctor } from "../doctor";

describe("Doctor", () => {
  it("creates with valid props", () => {
    const doctor = Doctor.create({
      usuarioId: "some-uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
    });

    expect(doctor.id).toBeTruthy();
    expect(doctor.usuarioId).toBe("some-uuid");
    expect(doctor.numeroColegiado).toBe("123456789");
    expect(doctor.especialidad).toBe("Cardiología");
    expect(doctor.verificado).toBe(false);
    expect(doctor.calificacionMedia).toBeUndefined();
    expect(doctor.biografia).toBeUndefined();
    expect(doctor.precioConsulta).toBeUndefined();
  });

  it("accepts optional fields", () => {
    const doctor = Doctor.create({
      usuarioId: "some-uuid",
      numeroColegiado: "123456789",
      especialidad: "Pediatría",
      biografia: "Experto en pediatría infantil",
      precioConsulta: 80,
      verificado: true,
      calificacionMedia: 4.5,
    });

    expect(doctor.biografia).toBe("Experto en pediatría infantil");
    expect(doctor.precioConsulta).toBe(80);
    expect(doctor.verificado).toBe(true);
    expect(doctor.calificacionMedia).toBe(4.5);
  });

  it("rejects empty numeroColegiado", () => {
    expect(() =>
      Doctor.create({
        usuarioId: "some-uuid",
        numeroColegiado: "",
        especialidad: "Cardiología",
      }),
    ).toThrow("Número de colegiado is required");
  });

  it("rejects empty especialidad", () => {
    expect(() =>
      Doctor.create({
        usuarioId: "some-uuid",
        numeroColegiado: "123456789",
        especialidad: "",
      }),
    ).toThrow("Especialidad is required");
  });

  it("rejects calificacionMedia > 5", () => {
    expect(() =>
      Doctor.create({
        usuarioId: "some-uuid",
        numeroColegiado: "123456789",
        especialidad: "Cardiología",
        calificacionMedia: 5.5,
      }),
    ).toThrow("Calificación media must be between 0 and 5");
  });

  it("rejects calificacionMedia < 0", () => {
    expect(() =>
      Doctor.create({
        usuarioId: "some-uuid",
        numeroColegiado: "123456789",
        especialidad: "Cardiología",
        calificacionMedia: -1,
      }),
    ).toThrow("Calificación media must be between 0 and 5");
  });

  it("accepts boundary calificacionMedia values", () => {
    const low = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
      calificacionMedia: 0,
    });
    expect(low.calificacionMedia).toBe(0);

    const high = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "987654321",
      especialidad: "Cardiología",
      calificacionMedia: 5,
    });
    expect(high.calificacionMedia).toBe(5);
  });

  it("defaults verificado to false", () => {
    const doctor = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
    });
    expect(doctor.verificado).toBe(false);
  });

  it("generates unique ids", () => {
    const a = Doctor.create({
      usuarioId: "uuid-1",
      numeroColegiado: "111",
      especialidad: "Cardiología",
    });
    const b = Doctor.create({
      usuarioId: "uuid-2",
      numeroColegiado: "222",
      especialidad: "Pediatría",
    });
    expect(a.id).not.toBe(b.id);
  });

  // ─── New fields (Phase 1) ─────────────────────────────────────────

  it("accepts new optional profile fields", () => {
    const doctor = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
      fotoUrl: "https://example.com/photo.jpg",
      ubicacionConsulta: "Madrid, España",
      añosExperiencia: 15,
      idiomas: ["Español", "Inglés"],
      telefonoConsulta: "+34911234567",
    });

    expect(doctor.fotoUrl).toBe("https://example.com/photo.jpg");
    expect(doctor.ubicacionConsulta).toBe("Madrid, España");
    expect(doctor.añosExperiencia).toBe(15);
    expect(doctor.idiomas).toEqual(["Español", "Inglés"]);
    expect(doctor.telefonoConsulta).toBe("+34911234567");
  });

  it("defaults new optional fields to undefined", () => {
    const doctor = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
    });

    expect(doctor.fotoUrl).toBeUndefined();
    expect(doctor.ubicacionConsulta).toBeUndefined();
    expect(doctor.añosExperiencia).toBeUndefined();
    expect(doctor.idiomas).toBeUndefined();
    expect(doctor.telefonoConsulta).toBeUndefined();
  });

  it("rejects negative añosExperiencia", () => {
    expect(() =>
      Doctor.create({
        usuarioId: "uuid",
        numeroColegiado: "123456789",
        especialidad: "Cardiología",
        añosExperiencia: -1,
      }),
    ).toThrow("Años de experiencia must be >= 0");
  });

  it("accepts zero añosExperiencia", () => {
    const doctor = Doctor.create({
      usuarioId: "uuid",
      numeroColegiado: "123456789",
      especialidad: "Cardiología",
      añosExperiencia: 0,
    });

    expect(doctor.añosExperiencia).toBe(0);
  });
});

describe("Doctor — aceptaOnline field (modality-toggle)", () => {
  it("defaults to false when aceptaOnline is omitted", () => {
    const doctor = Doctor.create({
      usuarioId: "user-1",
      numeroColegiado: "COL-123",
      especialidad: "Cardiología",
    });
    expect(doctor.aceptaOnline).toBe(false);
  });

  it("accepts true when aceptaOnline is passed", () => {
    const doctor = Doctor.create({
      usuarioId: "user-1",
      numeroColegiado: "COL-123",
      especialidad: "Cardiología",
      aceptaOnline: true,
    });
    expect(doctor.aceptaOnline).toBe(true);
  });

  it("accepts false explicitly", () => {
    const doctor = Doctor.create({
      usuarioId: "user-1",
      numeroColegiado: "COL-123",
      especialidad: "Cardiología",
      aceptaOnline: false,
    });
    expect(doctor.aceptaOnline).toBe(false);
  });
});
