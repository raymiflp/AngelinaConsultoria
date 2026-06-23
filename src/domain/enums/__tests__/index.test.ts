import { describe, expect, it } from "vitest";
import {
  UserRole,
  ConsultationStatus,
  canTransitionStatus,
  transitionStatus,
} from "../index";

describe("UserRole", () => {
  it("has exactly 10 values", () => {
    const values = Object.values(UserRole);
    expect(values).toHaveLength(10);
  });

  it("includes all expected roles", () => {
    expect(UserRole.PACIENTE).toBe("PACIENTE");
    expect(UserRole.DOCTOR).toBe("DOCTOR");
    expect(UserRole.ADMIN).toBe("ADMIN");
    expect(UserRole.DPO).toBe("DPO");
    expect(UserRole.SUPERADMIN).toBe("SUPERADMIN");
    expect(UserRole.TUTOR).toBe("TUTOR");
    expect(UserRole.STAFF).toBe("STAFF");
    expect(UserRole.CONTENT).toBe("CONTENT");
    expect(UserRole.FINANZAS).toBe("FINANZAS");
    expect(UserRole.ASEGURADORA).toBe("ASEGURADORA");
  });
});

describe("ConsultationStatus", () => {
  it("has exactly 6 values", () => {
    const values = Object.values(ConsultationStatus);
    expect(values).toHaveLength(6);
  });

  it("includes all expected statuses", () => {
    expect(ConsultationStatus.PENDIENTE).toBe("PENDIENTE");
    expect(ConsultationStatus.CONFIRMADA).toBe("CONFIRMADA");
    expect(ConsultationStatus.EN_CURSO).toBe("EN_CURSO");
    expect(ConsultationStatus.COMPLETADA).toBe("COMPLETADA");
    expect(ConsultationStatus.CANCELADA).toBe("CANCELADA");
    expect(ConsultationStatus.NO_ASISTIO).toBe("NO_ASISTIO");
  });
});

describe("canTransitionStatus", () => {
  it("allows PENDIENTE → CONFIRMADA", () => {
    expect(canTransitionStatus(ConsultationStatus.PENDIENTE, ConsultationStatus.CONFIRMADA)).toBe(true);
  });

  it("allows PENDIENTE → CANCELADA", () => {
    expect(canTransitionStatus(ConsultationStatus.PENDIENTE, ConsultationStatus.CANCELADA)).toBe(true);
  });

  it("allows CONFIRMADA → EN_CURSO", () => {
    expect(canTransitionStatus(ConsultationStatus.CONFIRMADA, ConsultationStatus.EN_CURSO)).toBe(true);
  });

  it("allows EN_CURSO → COMPLETADA", () => {
    expect(canTransitionStatus(ConsultationStatus.EN_CURSO, ConsultationStatus.COMPLETADA)).toBe(true);
  });

  it("allows EN_CURSO → NO_ASISTIO", () => {
    expect(canTransitionStatus(ConsultationStatus.EN_CURSO, ConsultationStatus.NO_ASISTIO)).toBe(true);
  });

  it("rejects PENDIENTE → COMPLETADA (skip)", () => {
    expect(canTransitionStatus(ConsultationStatus.PENDIENTE, ConsultationStatus.COMPLETADA)).toBe(false);
  });

  it("rejects COMPLETADA → anything (terminal)", () => {
    expect(canTransitionStatus(ConsultationStatus.COMPLETADA, ConsultationStatus.PENDIENTE)).toBe(false);
  });

  it("rejects CANCELADA → anything (terminal)", () => {
    expect(canTransitionStatus(ConsultationStatus.CANCELADA, ConsultationStatus.CONFIRMADA)).toBe(false);
  });
});

describe("transitionStatus", () => {
  it("returns the new status on valid transition", () => {
    const result = transitionStatus(ConsultationStatus.PENDIENTE, ConsultationStatus.CONFIRMADA);
    expect(result).toBe(ConsultationStatus.CONFIRMADA);
  });

  it("throws on invalid transition", () => {
    expect(() =>
      transitionStatus(ConsultationStatus.PENDIENTE, ConsultationStatus.COMPLETADA),
    ).toThrow("Invalid status transition");
  });
});
