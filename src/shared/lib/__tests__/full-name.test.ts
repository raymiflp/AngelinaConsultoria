import { describe, expect, it } from "vitest";
import { FullName } from "../full-name";

describe("FullName", () => {
  it("creates from valid first and last names", () => {
    const name = FullName.create("María", "García López");
    expect(name.toString()).toBe("María García López");
  });

  it("accepts compound last names with hyphen", () => {
    const name = FullName.create("José", "García-López");
    expect(name.toString()).toBe("José García-López");
  });

  it("accepts names with apostrophes", () => {
    const name = FullName.create("João", "D'Ávila");
    expect(name.toString()).toBe("João D'Ávila");
  });

  it("accepts unicode characters (ñ, accents)", () => {
    const name = FullName.create("Nuño", "Pérez");
    expect(name.toString()).toBe("Nuño Pérez");
  });

  it("trims whitespace", () => {
    const name = FullName.create("  María  ", "  García  ");
    expect(name.toString()).toBe("María García");
  });

  it("rejects too-short first name (single char)", () => {
    expect(() => FullName.create("A", "García")).toThrow("First name must be at least 2 characters");
  });

  it("rejects too-short last name", () => {
    expect(() => FullName.create("María", "G")).toThrow("Last name must be at least 2 characters");
  });

  it("rejects first name with numbers", () => {
    expect(() => FullName.create("María123", "García")).toThrow("First name contains invalid characters");
  });

  it("rejects last name with special characters", () => {
    expect(() => FullName.create("María", "García!")).toThrow("Last name contains invalid characters");
  });

  it("checks structural equality", () => {
    const a = FullName.create("María", "García");
    const b = FullName.create("María", "García");
    expect(a.equals(b)).toBe(true);
  });

  it("detects inequality", () => {
    const a = FullName.create("María", "García");
    const b = FullName.create("José", "García");
    expect(a.equals(b)).toBe(false);
  });
});
