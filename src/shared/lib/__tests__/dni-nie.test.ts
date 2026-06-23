import { describe, expect, it } from "vitest";
import { DNI_NIE } from "../dni-nie";

describe("DNI_NIE", () => {
  it("accepts a valid DNI (12345678Z)", () => {
    const dni = DNI_NIE.create("12345678Z");
    expect(dni.toString()).toBe("12345678Z");
  });

  it("accepts a valid DNI with lowercase letter", () => {
    const dni = DNI_NIE.create("12345678z");
    expect(dni.toString()).toBe("12345678Z");
  });

  it("rejects DNI with wrong letter (12345678A)", () => {
    // 12345678 % 23 = 14 → letter Z (not A)
    expect(() => DNI_NIE.create("12345678A")).toThrow("Invalid DNI/NIE letter");
  });

  it("accepts a valid NIE (X1234567L)", () => {
    // X → 0, number 01234567 % 23 = 19 → L
    const nie = DNI_NIE.create("X1234567L");
    expect(nie.toString()).toBe("X1234567L");
  });

  it("accepts NIE with Y prefix", () => {
    // Y → 1, number 11234567 % 23 = 10 → letter X
    const nie = DNI_NIE.create("Y1234567X");
    expect(nie.toString()).toBe("Y1234567X");
  });

  it("accepts NIE with Z prefix", () => {
    // Z → 2, number 21234567 % 23 = 1 → letter R
    const nie = DNI_NIE.create("Z1234567R");
    expect(nie.toString()).toBe("Z1234567R");
  });

  it("rejects NIE with invalid letter", () => {
    expect(() => DNI_NIE.create("X1234567A")).toThrow("Invalid DNI/NIE letter");
  });

  it("rejects invalid format (letters in wrong places)", () => {
    expect(() => DNI_NIE.create("A1234567Z")).toThrow("Invalid DNI/NIE format");
  });

  it("rejects too few digits", () => {
    expect(() => DNI_NIE.create("1234567Z")).toThrow("Invalid DNI/NIE format");
  });

  it("rejects too many digits", () => {
    expect(() => DNI_NIE.create("123456789Z")).toThrow("Invalid DNI/NIE format");
  });

  it("checks structural equality", () => {
    const a = DNI_NIE.create("12345678Z");
    const b = DNI_NIE.create("12345678z");
    expect(a.equals(b)).toBe(true);
  });

  it("detects inequality", () => {
    const a = DNI_NIE.create("12345678Z");
    const b = DNI_NIE.create("87654321X");
    expect(a.equals(b)).toBe(false);
  });
});
