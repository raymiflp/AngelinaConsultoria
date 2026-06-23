import { Address } from "@/shared/lib/address";

export class Paciente {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly fechaNacimiento: Date,
    readonly direccion: Address,
    readonly alergias: string[],
    readonly grupoSanguineo: string | undefined,
    readonly notasMedicas: string | undefined,
  ) {}

  static create(props: {
    usuarioId: string;
    fechaNacimiento: Date;
    direccion: Address;
    alergias?: string[];
    grupoSanguineo?: string;
    notasMedicas?: string;
  }): Paciente {
    return new Paciente(
      crypto.randomUUID(),
      props.usuarioId,
      props.fechaNacimiento,
      props.direccion,
      props.alergias ?? [],
      props.grupoSanguineo,
      props.notasMedicas,
    );
  }
}
