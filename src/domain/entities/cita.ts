import { ConsultaModalidad, ConsultationStatus, transitionStatus } from "@/domain/enums";

export class Cita {
  private constructor(
    readonly id: string,
    readonly doctorId: string,
    readonly pacienteId: string,
    readonly fechaHora: Date,
    readonly estado: ConsultationStatus,
    readonly motivo: string,
    readonly duracionMinutos: number,
    readonly precio: number | undefined,
    readonly modalidad: ConsultaModalidad,
  ) {}

  static create(props: {
    doctorId: string;
    pacienteId: string;
    fechaHora: Date;
    motivo: string;
    estado?: ConsultationStatus;
    duracionMinutos?: number;
    precio?: number;
    modalidad?: ConsultaModalidad;
  }): Cita {
    if (!props.motivo || props.motivo.trim().length === 0)
      throw new Error("Motivo is required");

    if (props.fechaHora.getTime() <= Date.now())
      throw new Error("fechaHora must be in the future");

    // Validate the optional modalidad (runtime guard on top of the TS type).
    // Defaults to PRESENCIAL when omitted to preserve backwards compatibility
    // with pre-change call sites that do not pass a modality.
    const modalidad = props.modalidad ?? ConsultaModalidad.PRESENCIAL;
    if (
      modalidad !== ConsultaModalidad.PRESENCIAL &&
      modalidad !== ConsultaModalidad.ONLINE
    ) {
      throw new Error("Invalid modalidad: must be PRESENCIAL or ONLINE");
    }

    return new Cita(
      crypto.randomUUID(),
      props.doctorId,
      props.pacienteId,
      props.fechaHora,
      props.estado ?? ConsultationStatus.PENDIENTE,
      props.motivo.trim(),
      props.duracionMinutos ?? 30,
      props.precio,
      modalidad,
    );
  }

  /**
   * Transition to a new valid state.
   */
  withEstado(nuevoEstado: ConsultationStatus): Cita {
    const validado = transitionStatus(this.estado, nuevoEstado);
    return new Cita(
      this.id,
      this.doctorId,
      this.pacienteId,
      this.fechaHora,
      validado,
      this.motivo,
      this.duracionMinutos,
      this.precio,
      this.modalidad,
    );
  }

  /**
   * Server-side derived LiveKit room name.
   *
   * Source of truth for the room name in MVP. The DB column
   * `citas.livekit_room_name` is reserved for future use (explicit
   * naming, audit, persistence) and is NOT read by this getter.
   *
   * Format: `cita-${this.id}` (e.g. `cita-8d2a1f8e-2b1c-4f00-aaaa-000000000001`).
   */
  get livekitRoomName(): string {
    return `cita-${this.id}`;
  }
}
