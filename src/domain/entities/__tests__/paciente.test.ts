import { describe, expect, it } from "vitest";
import { Address } from "@/shared/lib/address";
import { Paciente } from "../paciente";

function makeValidAddress(): Address {
  return Address.create({
    street: "Calle Mayor 10",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
}

describe("Paciente", () => {
  it("creates with valid props", () => {
    const birthDate = new Date("1990-05-15");
    const paciente = Paciente.create({
      usuarioId: "some-uuid",
      fechaNacimiento: birthDate,
      direccion: makeValidAddress(),
    });

    expect(paciente.id).toBeTruthy();
    expect(paciente.usuarioId).toBe("some-uuid");
    expect(paciente.fechaNacimiento).toBe(birthDate);
    expect(paciente.direccion.equals(makeValidAddress())).toBe(true);
    expect(paciente.alergias).toEqual([]);
    expect(paciente.grupoSanguineo).toBeUndefined();
    expect(paciente.notasMedicas).toBeUndefined();
  });

  it("defaults alergias to empty array", () => {
    const paciente = Paciente.create({
      usuarioId: "uuid",
      fechaNacimiento: new Date("1990-01-01"),
      direccion: makeValidAddress(),
    });
    expect(paciente.alergias).toEqual([]);
  });

  it("accepts optional fields", () => {
    const paciente = Paciente.create({
      usuarioId: "uuid",
      fechaNacimiento: new Date("1985-03-20"),
      direccion: makeValidAddress(),
      alergias: ["Penicilina", "Polen"],
      grupoSanguineo: "A+",
      notasMedicas: "Paciente con asma leve",
    });

    expect(paciente.alergias).toEqual(["Penicilina", "Polen"]);
    expect(paciente.grupoSanguineo).toBe("A+");
    expect(paciente.notasMedicas).toBe("Paciente con asma leve");
  });

  it("generates unique ids", () => {
    const a = Paciente.create({
      usuarioId: "uuid-1",
      fechaNacimiento: new Date(),
      direccion: makeValidAddress(),
    });
    const b = Paciente.create({
      usuarioId: "uuid-2",
      fechaNacimiento: new Date(),
      direccion: makeValidAddress(),
    });
    expect(a.id).not.toBe(b.id);
  });
});
