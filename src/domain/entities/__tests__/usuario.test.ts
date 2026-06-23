import { describe, expect, it } from "vitest";
import { Email } from "@/shared/lib/email";
import { FullName } from "@/shared/lib/full-name";
import { Phone } from "@/shared/lib/phone";
import { UserRole } from "@/domain/enums";
import { Usuario } from "../usuario";

function makeValidProps() {
  return {
    email: Email.create("doctor@clinica.com"),
    nombreCompleto: FullName.create("María", "García López"),
    passwordHash: "$2b$10$hashedpasswordstring",
    rol: UserRole.DOCTOR,
    telefono: Phone.create("+34612345678"),
  };
}

describe("Usuario", () => {
  it("creates with valid props", () => {
    const props = makeValidProps();
    const usuario = Usuario.create(props);

    expect(usuario.id).toBeTruthy();
    expect(usuario.id.length).toBeGreaterThan(0);
    expect(usuario.email.equals(props.email)).toBe(true);
    expect(usuario.nombreCompleto.equals(props.nombreCompleto)).toBe(true);
    expect(usuario.passwordHash).toBe(props.passwordHash);
    expect(usuario.rol).toBe(UserRole.DOCTOR);
    expect(usuario.telefono.equals(props.telefono)).toBe(true);
    expect(usuario.activo).toBe(true);
    expect(usuario.createdAt).toBeInstanceOf(Date);
    expect(usuario.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects empty passwordHash", () => {
    expect(() =>
      Usuario.create({ ...makeValidProps(), passwordHash: "" }),
    ).toThrow("Password hash is required");
  });

  it("rejects whitespace-only passwordHash", () => {
    expect(() =>
      Usuario.create({ ...makeValidProps(), passwordHash: "   " }),
    ).toThrow("Password hash is required");
  });

  it("generates a UUID for id", () => {
    const a = Usuario.create(makeValidProps());
    const b = Usuario.create(makeValidProps());
    expect(a.id).not.toBe(b.id);
  });

  it("defaults activo to true", () => {
    const usuario = Usuario.create(makeValidProps());
    expect(usuario.activo).toBe(true);
  });
});
