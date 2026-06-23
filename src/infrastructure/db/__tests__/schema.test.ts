import { describe, expect, it } from "vitest";
import {
  usuarios,
  doctores,
  pacientes,
  citas,
  auditLogs,
  consentimientos,
} from "../schema";

describe("Drizzle Schema Definitions — import & type verification", () => {
  it("imports usuarios table", () => {
    expect(usuarios).toBeDefined();
  });

  it("imports doctores table", () => {
    expect(doctores).toBeDefined();
  });

  it("imports pacientes table", () => {
    expect(pacientes).toBeDefined();
  });

  it("imports citas table", () => {
    expect(citas).toBeDefined();
  });

  it("imports audit_logs table", () => {
    expect(auditLogs).toBeDefined();
  });

  it("imports consentimientos table", () => {
    expect(consentimientos).toBeDefined();
  });
});
