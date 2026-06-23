export class Doctor {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly numeroColegiado: string,
    readonly especialidad: string,
    readonly biografia: string | undefined,
    readonly precioConsulta: number | undefined,
    readonly verificado: boolean,
    readonly calificacionMedia: number | undefined,
    readonly fotoUrl: string | undefined,
    readonly ubicacionConsulta: string | undefined,
    readonly añosExperiencia: number | undefined,
    readonly idiomas: string[] | undefined,
    readonly telefonoConsulta: string | undefined,
    readonly aceptaOnline: boolean,
  ) {}

  static create(props: {
    usuarioId: string;
    numeroColegiado: string;
    especialidad: string;
    biografia?: string;
    precioConsulta?: number;
    verificado?: boolean;
    calificacionMedia?: number;
    fotoUrl?: string;
    ubicacionConsulta?: string;
    añosExperiencia?: number;
    idiomas?: string[];
    telefonoConsulta?: string;
    aceptaOnline?: boolean;
  }): Doctor {
    if (!props.numeroColegiado || props.numeroColegiado.trim().length === 0)
      throw new Error("Número de colegiado is required");
    if (!props.especialidad || props.especialidad.trim().length === 0)
      throw new Error("Especialidad is required");

    if (props.calificacionMedia !== undefined) {
      if (props.calificacionMedia < 0 || props.calificacionMedia > 5)
        throw new Error("Calificación media must be between 0 and 5");
    }

    if (props.añosExperiencia !== undefined && props.añosExperiencia < 0) {
      throw new Error("Años de experiencia must be >= 0");
    }

    return new Doctor(
      crypto.randomUUID(),
      props.usuarioId,
      props.numeroColegiado.trim(),
      props.especialidad.trim(),
      props.biografia?.trim(),
      props.precioConsulta,
      props.verificado ?? false,
      props.calificacionMedia,
      props.fotoUrl?.trim(),
      props.ubicacionConsulta?.trim(),
      props.añosExperiencia,
      props.idiomas,
      props.telefonoConsulta?.trim(),
      props.aceptaOnline ?? false,
    );
  }
}
