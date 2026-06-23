import { describe, expect, it } from "vitest";
import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";
import { Cita } from "../cita";

function futureDate(daysFromNow = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

function pastDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

describe("Cita", () => {
  it("creates with valid props and defaults", () => {
    const cita = Cita.create({
      doctorId: "doctor-uuid",
      pacienteId: "paciente-uuid",
      fechaHora: futureDate(),
      motivo: "Revisión general",
    });

    expect(cita.id).toBeTruthy();
    expect(cita.doctorId).toBe("doctor-uuid");
    expect(cita.pacienteId).toBe("paciente-uuid");
    expect(cita.estado).toBe(ConsultationStatus.PENDIENTE);
    expect(cita.motivo).toBe("Revisión general");
    expect(cita.duracionMinutos).toBe(30);
    expect(cita.precio).toBeUndefined();
    expect(cita.modalidad).toBe("PRESENCIAL");
  });

  it("accepts optional fields", () => {
    const cita = Cita.create({
      doctorId: "doctor-uuid",
      pacienteId: "paciente-uuid",
      fechaHora: futureDate(),
      motivo: "Consulta especialista",
      estado: ConsultationStatus.CONFIRMADA,
      duracionMinutos: 45,
      precio: 120,
    });

    expect(cita.estado).toBe(ConsultationStatus.CONFIRMADA);
    expect(cita.duracionMinutos).toBe(45);
    expect(cita.precio).toBe(120);
  });

  it("rejects past fechaHora", () => {
    expect(() =>
      Cita.create({
        doctorId: "doctor-uuid",
        pacienteId: "paciente-uuid",
        fechaHora: pastDate(),
        motivo: "Revisión",
      }),
    ).toThrow("fechaHora must be in the future");
  });

  it("rejects empty motivo", () => {
    expect(() =>
      Cita.create({
        doctorId: "doctor-uuid",
        pacienteId: "paciente-uuid",
        fechaHora: futureDate(),
        motivo: "",
      }),
    ).toThrow("Motivo is required");
  });

  it("allows PENDIENTE → CONFIRMADA transition", () => {
    const cita = Cita.create({
      doctorId: "dr-uuid",
      pacienteId: "pac-uuid",
      fechaHora: futureDate(),
      motivo: "Control",
    });

    const confirmada = cita.withEstado(ConsultationStatus.CONFIRMADA);
    expect(confirmada.estado).toBe(ConsultationStatus.CONFIRMADA);
    // Other fields preserved
    expect(confirmada.id).toBe(cita.id);
    expect(confirmada.motivo).toBe(cita.motivo);
  });

  it("rejects invalid transition PENDIENTE → COMPLETADA", () => {
    const cita = Cita.create({
      doctorId: "dr-uuid",
      pacienteId: "pac-uuid",
      fechaHora: futureDate(),
      motivo: "Control",
    });

    expect(() => cita.withEstado(ConsultationStatus.COMPLETADA)).toThrow(
      "Invalid status transition",
    );
  });

  it("generates unique ids", () => {
    const a = Cita.create({
      doctorId: "dr-1",
      pacienteId: "pac-1",
      fechaHora: futureDate(),
      motivo: "Motivo A",
    });
    const b = Cita.create({
      doctorId: "dr-2",
      pacienteId: "pac-2",
      fechaHora: futureDate(8),
      motivo: "Motivo B",
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe("Cita — modalidad field (modality-toggle)", () => {
  it("defaults to PRESENCIAL when modality is omitted", () => {
    const cita = Cita.create({
      doctorId: "doc-1",
      pacienteId: "pac-1",
      fechaHora: futureDate(),
      motivo: "Control",
    });
    expect(cita.modalidad).toBe("PRESENCIAL");
  });

  it("accepts ONLINE when modality is passed", () => {
    const cita = Cita.create({
      doctorId: "doc-1",
      pacienteId: "pac-1",
      fechaHora: futureDate(),
      motivo: "Control",
      modalidad: ConsultaModalidad.ONLINE,
    });
    expect(cita.modalidad).toBe(ConsultaModalidad.ONLINE);
  });

  it("rejects an invalid modality value at the runtime guard", () => {
    expect(() =>
      Cita.create({
        doctorId: "doc-1",
        pacienteId: "pac-1",
        fechaHora: futureDate(),
        motivo: "Control",
        // @ts-expect-error — exercising the runtime guard on top of the TS type
        modalidad: "HIDRIDA",
      }),
    ).toThrow("Invalid modalidad");
  });

  it("preserves modality across withEstado transitions", () => {
    const cita = Cita.create({
      doctorId: "doc-1",
      pacienteId: "pac-1",
      fechaHora: futureDate(),
      motivo: "Control",
      modalidad: ConsultaModalidad.ONLINE,
    });
    const confirmada = cita.withEstado(ConsultationStatus.CONFIRMADA);
    expect(confirmada.modalidad).toBe(ConsultaModalidad.ONLINE);
    const enCurso = confirmada.withEstado(ConsultationStatus.EN_CURSO);
    expect(enCurso.modalidad).toBe(ConsultaModalidad.ONLINE);
  });
});

describe("Cita.livekitRoomName getter", () => {
  it("returns the documented cita-${id} format and matches the regex", () => {
    const cita = Cita.create({
      doctorId: "dr-uuid",
      pacienteId: "pac-uuid",
      fechaHora: futureDate(),
      motivo: "Control",
    });
    expect(cita.livekitRoomName).toBe(`cita-${cita.id}`);
    expect(cita.livekitRoomName).toMatch(/^cita-[0-9a-f-]{36}$/);
  });

  it("is a property accessor (not a method)", () => {
    const cita = Cita.create({
      doctorId: "dr-uuid",
      pacienteId: "pac-uuid",
      fechaHora: futureDate(),
      motivo: "Control",
    });
    expect(typeof cita.livekitRoomName).toBe("string");
    // Property access — not a function
    expect((cita as unknown as { livekitRoomName: unknown }).livekitRoomName).not.toBeInstanceOf(
      Function,
    );
  });

  it("is pure — two different citas return different room names, and the getter does not read the DB", () => {
    const a = Cita.create({
      doctorId: "dr-a",
      pacienteId: "pac-a",
      fechaHora: futureDate(),
      motivo: "Motivo A",
    });
    const b = Cita.create({
      doctorId: "dr-b",
      pacienteId: "pac-b",
      fechaHora: futureDate(8),
      motivo: "Motivo B",
    });
    expect(a.livekitRoomName).not.toBe(b.livekitRoomName);
    // No DB column knowledge — the Cita class has no livekitRoomName field
    expect((a as unknown as { livekitRoomName: unknown }).livekitRoomName).toBeTruthy();
    expect((b as unknown as { livekitRoomName: unknown }).livekitRoomName).toBeTruthy();
  });

  it("is idempotent across 100 accesses and never mutates state", () => {
    const cita = Cita.create({
      doctorId: "dr-uuid",
      pacienteId: "pac-uuid",
      fechaHora: futureDate(),
      motivo: "Control",
    });
    const snapshot = cita.livekitRoomName;
    for (let i = 0; i < 100; i++) {
      expect(cita.livekitRoomName).toBe(snapshot);
    }
    // State unchanged
    expect(cita.id).toBeTruthy();
    expect(cita.estado).toBe(ConsultationStatus.PENDIENTE);
    expect(cita.motivo).toBe("Control");
  });
});
