import { describe, expect, it } from "vitest";
import {
  setAvailabilitySchema,
  createAppointmentSchema,
  updateStatusSchema,
  updateNotesSchema,
  dateSchema,
} from "../schemas";
import { ConsultationStatus } from "@/domain/enums";

describe("setAvailabilitySchema", () => {
  it("accepts valid weekly schedule", () => {
    const input = {
      disponibilidad: {
        lunes: [{ inicio: "09:00", fin: "12:00" }],
        martes: [{ inicio: "14:00", fin: "18:00" }],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid time format (not HH:mm)", () => {
    const input = {
      disponibilidad: {
        lunes: [{ inicio: "9:00", fin: "12:00" }],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects start >= end", () => {
    const input = {
      disponibilidad: {
        lunes: [{ inicio: "14:00", fin: "12:00" }],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty ranges per day", () => {
    const input = {
      disponibilidad: {
        lunes: [],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid day keys", () => {
    const input = {
      disponibilidad: {
        invalidDay: [{ inicio: "09:00", fin: "12:00" }],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts all 7 days with multiple ranges", () => {
    const input = {
      disponibilidad: {
        lunes: [{ inicio: "09:00", fin: "12:00" }],
        martes: [{ inicio: "09:00", fin: "12:00" }],
        miercoles: [{ inicio: "09:00", fin: "12:00" }],
        jueves: [{ inicio: "09:00", fin: "12:00" }],
        viernes: [{ inicio: "09:00", fin: "12:00" }],
        sabado: [{ inicio: "10:00", fin: "14:00" }],
        domingo: [{ inicio: "10:00", fin: "14:00" }],
      },
    };
    const result = setAvailabilitySchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("createAppointmentSchema", () => {
  it("accepts valid appointment input with PRESENCIAL modality", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "Revisión general",
      modalidad: "PRESENCIAL",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid appointment input with ONLINE modality", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "Revisión general",
      modalidad: "ONLINE",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid doctorId", () => {
    const input = {
      doctorId: "not-a-uuid",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "Revisión",
      modalidad: "PRESENCIAL",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty motivoConsulta", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "",
      modalidad: "PRESENCIAL",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid fechaHora format", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "15-07-2026",
      motivoConsulta: "Revisión",
      modalidad: "PRESENCIAL",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects motivoConsulta exceeding 1000 characters", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "x".repeat(1001),
      modalidad: "PRESENCIAL",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing modalidad (required since modality-toggle, PR-B)", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "Revisión",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid modalidad value with the Spanish error message", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      fechaHora: "2026-07-15T10:00:00.000Z",
      motivoConsulta: "Revisión",
      modalidad: "HIDRIDA",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const modalidadIssue = result.error.issues.find(
        (i) => i.path[0] === "modalidad",
      );
      expect(modalidadIssue?.message).toBe(
        "Modalidad inválida: debe ser PRESENCIAL u ONLINE",
      );
    }
  });
});

describe("updateStatusSchema", () => {
  it("accepts valid status update", () => {
    const input = {
      citaId: "550e8400-e29b-41d4-a716-446655440000",
      nuevoEstado: ConsultationStatus.CONFIRMADA,
    };
    const result = updateStatusSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts status with motivo", () => {
    const input = {
      citaId: "550e8400-e29b-41d4-a716-446655440000",
      nuevoEstado: ConsultationStatus.CANCELADA,
      motivo: "Cancelado por el doctor",
    };
    const result = updateStatusSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const input = {
      citaId: "550e8400-e29b-41d4-a716-446655440000",
      nuevoEstado: "INVALID_STATUS",
    };
    const result = updateStatusSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("updateNotesSchema", () => {
  it("accepts valid notes", () => {
    const input = {
      citaId: "550e8400-e29b-41d4-a716-446655440000",
      notas: "Paciente presenta mejoría significativa",
    };
    const result = updateNotesSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects notes exceeding 5000 characters", () => {
    const input = {
      citaId: "550e8400-e29b-41d4-a716-446655440000",
      notas: "x".repeat(5001),
    };
    const result = updateNotesSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("dateSchema", () => {
  it("accepts valid date query", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2026-07-15",
    };
    const result = dateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const input = {
      doctorId: "550e8400-e29b-41d4-a716-446655440000",
      date: "15-07-2026",
    };
    const result = dateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
