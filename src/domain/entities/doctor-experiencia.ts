export type ExperienceTipo = "education" | "work";

export class DoctorExperience {
  private constructor(
    readonly id: string,
    readonly doctorId: string,
    readonly tipo: ExperienceTipo,
    readonly titulo: string,
    readonly institucion: string,
    readonly fechaInicio: string,
    readonly fechaFin: string | undefined,
    readonly descripcion: string | undefined,
    readonly orden: number,
  ) {}

  static create(props: {
    doctorId: string;
    tipo: ExperienceTipo;
    titulo: string;
    institucion: string;
    fechaInicio: string;
    fechaFin?: string;
    descripcion?: string;
    orden?: number;
  }): DoctorExperience {
    if (props.tipo !== "education" && props.tipo !== "work") {
      throw new Error("Tipo must be 'education' or 'work'");
    }

    if (!props.titulo || props.titulo.trim().length === 0) {
      throw new Error("Título is required");
    }

    if (!props.institucion || props.institucion.trim().length === 0) {
      throw new Error("Institución is required");
    }

    return new DoctorExperience(
      crypto.randomUUID(),
      props.doctorId,
      props.tipo,
      props.titulo.trim(),
      props.institucion.trim(),
      props.fechaInicio,
      props.fechaFin,
      props.descripcion?.trim(),
      props.orden ?? 0,
    );
  }
}
