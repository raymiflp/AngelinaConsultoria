import { describe, it, expect } from "vitest";
import {
  doctorUpdateSchema,
  pacienteUpdateSchema,
  updateProfileSchema,
  direccionSchema,
} from "@/infrastructure/profiles/schemas";

describe("doctorUpdateSchema", () => {
  it("accepts valid doctor data", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "12345",
      especialidad: "Cardiología",
      biografia: "20 years of experience",
      precioConsulta: 150,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial data (only required fields)", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "12345",
      especialidad: "Cardiología",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty numeroColegiado", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "",
      especialidad: "Cardiología",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("numeroColegiado");
    }
  });

  it("rejects empty especialidad", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "12345",
      especialidad: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "12345",
      especialidad: "Cardiología",
      precioConsulta: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero price", () => {
    const result = doctorUpdateSchema.safeParse({
      numeroColegiado: "12345",
      especialidad: "Cardiología",
      precioConsulta: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("direccionSchema", () => {
  it("accepts valid address", () => {
    const result = direccionSchema.safeParse({
      calle: "Calle Mayor 10",
      ciudad: "Madrid",
      provincia: "Madrid",
      codigoPostal: "28001",
      pais: "España",
    });
    expect(result.success).toBe(true);
  });

  it("defaults pais to España", () => {
    const result = direccionSchema.safeParse({
      calle: "Calle Mayor 10",
      ciudad: "Madrid",
      provincia: "Madrid",
      codigoPostal: "28001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pais).toBe("España");
    }
  });

  it("rejects invalid codigoPostal length", () => {
    const result = direccionSchema.safeParse({
      calle: "Calle Mayor 10",
      ciudad: "Madrid",
      provincia: "Madrid",
      codigoPostal: "123",
    });
    expect(result.success).toBe(false);
  });
});

describe("pacienteUpdateSchema", () => {
  it("accepts valid patient data", () => {
    const result = pacienteUpdateSchema.safeParse({
      fechaNacimiento: "1990-01-15",
      direccion: {
        calle: "Calle Mayor 10",
        ciudad: "Madrid",
        provincia: "Madrid",
        codigoPostal: "28001",
        pais: "España",
      },
      alergias: ["Penicilina", "Polen"],
      grupoSanguineo: "A+",
      notasMedicas: "Alérgico a penicilina",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal data with defaults", () => {
    const result = pacienteUpdateSchema.safeParse({
      fechaNacimiento: "1990-01-15",
      direccion: {
        calle: "Calle Mayor 10",
        ciudad: "Madrid",
        provincia: "Madrid",
        codigoPostal: "28001",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alergias).toEqual([]);
      expect(result.data.direccion.pais).toBe("España");
    }
  });

  it("rejects invalid date format", () => {
    const result = pacienteUpdateSchema.safeParse({
      fechaNacimiento: "15-01-1990",
      direccion: {
        calle: "Calle Mayor 10",
        ciudad: "Madrid",
        provincia: "Madrid",
        codigoPostal: "28001",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty required address fields", () => {
    const result = pacienteUpdateSchema.safeParse({
      fechaNacimiento: "1990-01-15",
      direccion: {
        calle: "",
        ciudad: "Madrid",
        provincia: "Madrid",
        codigoPostal: "28001",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProfileSchema (discriminated union)", () => {
  it("accepts valid DOCTOR input", () => {
    const result = updateProfileSchema.safeParse({
      rol: "DOCTOR",
      nombre: "Dr. García",
      telefono: "612345678",
      numeroColegiado: "12345",
      especialidad: "Cardiología",
      biografia: "Experto en cardiología intervencionista",
      precioConsulta: 200,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid PACIENTE input", () => {
    const result = updateProfileSchema.safeParse({
      rol: "PACIENTE",
      nombre: "Ana López",
      telefono: "612345679",
      fechaNacimiento: "1985-06-20",
      direccion: {
        calle: "Av. Principal 30",
        ciudad: "Barcelona",
        provincia: "Barcelona",
        codigoPostal: "08001",
      },
      alergias: ["Sulfa"],
      grupoSanguineo: "O-",
      notasMedicas: "Asma leve",
    });
    expect(result.success).toBe(true);
  });

  it("rejects DOCTOR input with patient-only fields", () => {
    const result = updateProfileSchema.safeParse({
      rol: "DOCTOR",
      nombre: "Dr. García",
      fechaNacimiento: "1990-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects PACIENTE input with doctor-only fields", () => {
    const result = updateProfileSchema.safeParse({
      rol: "PACIENTE",
      nombre: "Ana López",
      especialidad: "Cardiología",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input without rol field", () => {
    const result = updateProfileSchema.safeParse({
      nombre: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid rol value", () => {
    const result = updateProfileSchema.safeParse({
      rol: "ADMIN",
      nombre: "Test User",
    });
    expect(result.success).toBe(false);
  });
});
