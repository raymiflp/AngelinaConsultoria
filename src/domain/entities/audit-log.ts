export interface AuditLogDetalles {
  [key: string]: unknown;
}

export class AuditLog {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly accion: string,
    readonly entidadAfectada: string,
    readonly entidadId: string,
    readonly detalles: AuditLogDetalles | null,
    readonly direccionIP: string,
    readonly createdAt: Date,
  ) {}

  static create(props: {
    usuarioId: string;
    accion: string;
    entidadAfectada: string;
    entidadId: string;
    detalles?: AuditLogDetalles | null;
    direccionIP: string;
  }): AuditLog {
    if (!props.usuarioId || props.usuarioId.trim().length === 0)
      throw new Error("usuarioId is required");
    if (!props.accion || props.accion.trim().length === 0)
      throw new Error("accion is required");
    if (!props.entidadAfectada || props.entidadAfectada.trim().length === 0)
      throw new Error("entidadAfectada is required");
    if (!props.entidadId || props.entidadId.trim().length === 0)
      throw new Error("entidadId is required");
    if (!props.direccionIP || props.direccionIP.trim().length === 0)
      throw new Error("direccionIP is required");

    return new AuditLog(
      crypto.randomUUID(),
      props.usuarioId.trim(),
      props.accion.trim(),
      props.entidadAfectada.trim(),
      props.entidadId.trim(),
      props.detalles ?? null,
      props.direccionIP.trim(),
      new Date(),
    );
  }
}
