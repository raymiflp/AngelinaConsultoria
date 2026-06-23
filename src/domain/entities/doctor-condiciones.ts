export class DoctorCondition {
  private constructor(
    readonly id: string,
    readonly doctorId: string,
    readonly nombre: string,
  ) {}

  static create(props: {
    doctorId: string;
    nombre: string;
  }): DoctorCondition {
    if (!props.nombre || props.nombre.trim().length === 0) {
      throw new Error("Nombre is required");
    }

    return new DoctorCondition(
      crypto.randomUUID(),
      props.doctorId,
      props.nombre.trim(),
    );
  }
}
