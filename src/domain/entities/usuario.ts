import { Email } from "@/shared/lib/email";
import { FullName } from "@/shared/lib/full-name";
import { Phone } from "@/shared/lib/phone";
import { UserRole } from "@/domain/enums";

export class Usuario {
  private constructor(
    readonly id: string,
    readonly email: Email,
    readonly nombreCompleto: FullName,
    readonly passwordHash: string,
    readonly rol: UserRole,
    readonly telefono: Phone,
    readonly activo: boolean,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static create(props: {
    email: Email;
    nombreCompleto: FullName;
    passwordHash: string;
    rol: UserRole;
    telefono: Phone;
  }): Usuario {
    if (!props.passwordHash || props.passwordHash.trim().length === 0)
      throw new Error("Password hash is required");

    const now = new Date();
    return new Usuario(
      crypto.randomUUID(),
      props.email,
      props.nombreCompleto,
      props.passwordHash,
      props.rol,
      props.telefono,
      true,
      now,
      now,
    );
  }
}
