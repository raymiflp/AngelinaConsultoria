export class DoctorService {
  private constructor(
    readonly id: string,
    readonly doctorId: string,
    readonly nombre: string,
    readonly descripcion: string | undefined,
    readonly precio: number,
    readonly duracionMinutos: number | undefined,
    readonly activo: boolean,
    readonly orden: number,
  ) {}

  static create(props: {
    doctorId: string;
    nombre: string;
    descripcion?: string;
    precio: number;
    duracionMinutos?: number;
    activo?: boolean;
    orden?: number;
  }): DoctorService {
    if (!props.nombre || props.nombre.trim().length === 0) {
      throw new Error("Nombre is required");
    }

    if (props.precio <= 0) {
      throw new Error("Precio must be greater than 0");
    }

    return new DoctorService(
      crypto.randomUUID(),
      props.doctorId,
      props.nombre.trim(),
      props.descripcion?.trim(),
      props.precio,
      props.duracionMinutos,
      props.activo ?? true,
      props.orden ?? 0,
    );
  }
}
