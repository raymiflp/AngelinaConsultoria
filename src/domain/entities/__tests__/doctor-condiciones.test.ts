import { describe, expect, it } from "vitest";
import { DoctorCondition } from "../doctor-condiciones";

describe("DoctorCondition", () => {
  it("creates with valid props", () => {
    const condition = DoctorCondition.create({
      doctorId: "doc-1",
      nombre: "Diabetes tipo 2",
    });

    expect(condition.id).toBeTruthy();
    expect(condition.doctorId).toBe("doc-1");
    expect(condition.nombre).toBe("Diabetes tipo 2");
  });

  it("rejects empty nombre", () => {
    expect(() =>
      DoctorCondition.create({
        doctorId: "doc-1",
        nombre: "",
      }),
    ).toThrow("Nombre is required");
  });

  it("rejects whitespace-only nombre", () => {
    expect(() =>
      DoctorCondition.create({
        doctorId: "doc-1",
        nombre: "   ",
      }),
    ).toThrow("Nombre is required");
  });

  it("trims whitespace from nombre", () => {
    const condition = DoctorCondition.create({
      doctorId: "doc-1",
      nombre: "  Hipertensión  ",
    });

    expect(condition.nombre).toBe("Hipertensión");
  });

  it("generates unique ids", () => {
    const a = DoctorCondition.create({
      doctorId: "doc-1",
      nombre: "Diabetes",
    });
    const b = DoctorCondition.create({
      doctorId: "doc-1",
      nombre: "Hipertensión",
    });

    expect(a.id).not.toBe(b.id);
  });
});
