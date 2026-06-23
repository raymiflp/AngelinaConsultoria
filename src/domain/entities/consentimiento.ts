export class Consentimiento {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly tipo: string,
    readonly version: string,
    readonly aceptado: boolean,
    readonly fechaAceptacion: Date | undefined,
    readonly fechaExpiracion: Date | undefined,
  ) {}

  static create(props: {
    usuarioId: string;
    tipo: string;
    version: string;
    aceptado: boolean;
    fechaAceptacion?: Date;
    fechaExpiracion?: Date;
  }): Consentimiento {
    if (!props.tipo || props.tipo.trim().length === 0)
      throw new Error("tipo is required");
    if (!props.version || props.version.trim().length === 0)
      throw new Error("version is required");

    if (props.aceptado && !props.fechaAceptacion)
      throw new Error("fechaAceptacion is required when aceptado is true");

    if (props.fechaAceptacion && props.fechaExpiracion) {
      if (props.fechaExpiracion.getTime() <= props.fechaAceptacion.getTime())
        throw new Error("fechaExpiracion must be after fechaAceptacion");
    }

    return new Consentimiento(
      crypto.randomUUID(),
      props.usuarioId,
      props.tipo.trim(),
      props.version.trim(),
      props.aceptado,
      props.fechaAceptacion,
      props.fechaExpiracion,
    );
  }
}
