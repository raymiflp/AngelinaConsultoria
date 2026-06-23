import { describe, expect, it } from "vitest";
import { DoctorExperience } from "../doctor-experiencia";

describe("DoctorExperience", () => {
  it("creates an education entry with valid props", () => {
    const entry = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "education",
      titulo: "Máster en Pediatría",
      institucion: "Universidad Complutense de Madrid",
      fechaInicio: "2015-09-01",
      fechaFin: "2019-06-30",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.doctorId).toBe("doc-1");
    expect(entry.tipo).toBe("education");
    expect(entry.titulo).toBe("Máster en Pediatría");
    expect(entry.institucion).toBe("Universidad Complutense de Madrid");
    expect(entry.fechaInicio).toBe("2015-09-01");
    expect(entry.fechaFin).toBe("2019-06-30");
    expect(entry.descripcion).toBeUndefined();
    expect(entry.orden).toBe(0);
  });

  it("creates a work entry with valid props", () => {
    const entry = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "work",
      titulo: "Médico de Familia",
      institucion: "Hospital San Juan de Dios",
      fechaInicio: "2020-01-15",
      descripcion: "Atención primaria y urgencias",
      orden: 1,
    });

    expect(entry.tipo).toBe("work");
    expect(entry.titulo).toBe("Médico de Familia");
    expect(entry.institucion).toBe("Hospital San Juan de Dios");
    expect(entry.fechaInicio).toBe("2020-01-15");
    expect(entry.fechaFin).toBeUndefined();
    expect(entry.descripcion).toBe("Atención primaria y urgencias");
    expect(entry.orden).toBe(1);
  });

  it("rejects invalid tipo", () => {
    expect(() =>
      DoctorExperience.create({
        doctorId: "doc-1",
        tipo: "invalid" as "education",
        titulo: "Título",
        institucion: "Institución",
        fechaInicio: "2020-01-01",
      }),
    ).toThrow("Tipo must be 'education' or 'work'");
  });

  it("rejects empty titulo", () => {
    expect(() =>
      DoctorExperience.create({
        doctorId: "doc-1",
        tipo: "education",
        titulo: "",
        institucion: "Institución",
        fechaInicio: "2020-01-01",
      }),
    ).toThrow("Título is required");
  });

  it("rejects empty institucion", () => {
    expect(() =>
      DoctorExperience.create({
        doctorId: "doc-1",
        tipo: "education",
        titulo: "Título",
        institucion: "",
        fechaInicio: "2020-01-01",
      }),
    ).toThrow("Institución is required");
  });

  it("trims whitespace from string fields", () => {
    const entry = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "education",
      titulo: "  Máster en Pediatría  ",
      institucion: "  Universidad Complutense  ",
      fechaInicio: "2020-01-01",
    });

    expect(entry.titulo).toBe("Máster en Pediatría");
    expect(entry.institucion).toBe("Universidad Complutense");
    expect(entry.descripcion).toBeUndefined();

    const withDesc = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "work",
      titulo: "Título",
      institucion: "Institución",
      fechaInicio: "2020-01-01",
      descripcion: "  Descripción con espacios  ",
    });

    expect(withDesc.descripcion).toBe("Descripción con espacios");
  });

  it("generates unique ids", () => {
    const a = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "education",
      titulo: "Título A",
      institucion: "Institución A",
      fechaInicio: "2020-01-01",
    });
    const b = DoctorExperience.create({
      doctorId: "doc-1",
      tipo: "work",
      titulo: "Título B",
      institucion: "Institución B",
      fechaInicio: "2020-01-01",
    });

    expect(a.id).not.toBe(b.id);
  });
});
