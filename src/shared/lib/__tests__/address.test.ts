import { describe, expect, it } from "vitest";
import { Address } from "../address";

describe("Address", () => {
  it("creates a complete address", () => {
    const address = Address.create({
      street: "Calle Mayor 10",
      city: "Madrid",
      province: "Madrid",
      postalCode: "28001",
    });
    expect(address.street).toBe("Calle Mayor 10");
    expect(address.city).toBe("Madrid");
    expect(address.province).toBe("Madrid");
    expect(address.postalCode).toBe("28001");
    expect(address.country).toBe("España");
  });

  it("uses default country España", () => {
    const address = Address.create({
      street: "Calle Mayor 10",
      city: "Madrid",
      province: "Madrid",
      postalCode: "28001",
    });
    expect(address.country).toBe("España");
  });

  it("accepts custom country", () => {
    const address = Address.create({
      street: "Calle Mayor 10",
      city: "Madrid",
      province: "Madrid",
      postalCode: "28001",
      country: "Portugal",
    });
    expect(address.country).toBe("Portugal");
  });

  it("rejects invalid postal code (too short)", () => {
    expect(() =>
      Address.create({
        street: "Calle Mayor 10",
        city: "Madrid",
        province: "Madrid",
        postalCode: "999",
      }),
    ).toThrow("Postal code must be exactly 5 digits");
  });

  it("rejects invalid postal code (letters)", () => {
    expect(() =>
      Address.create({
        street: "Calle Mayor 10",
        city: "Madrid",
        province: "Madrid",
        postalCode: "ABCDE",
      }),
    ).toThrow("Postal code must be exactly 5 digits");
  });

  it("rejects empty street", () => {
    expect(() =>
      Address.create({
        street: "",
        city: "Madrid",
        province: "Madrid",
        postalCode: "28001",
      }),
    ).toThrow("Street is required");
  });

  it("rejects empty city", () => {
    expect(() =>
      Address.create({
        street: "Calle Mayor 10",
        city: "",
        province: "Madrid",
        postalCode: "28001",
      }),
    ).toThrow("City is required");
  });

  it("rejects empty province", () => {
    expect(() =>
      Address.create({
        street: "Calle Mayor 10",
        city: "Madrid",
        province: "",
        postalCode: "28001",
      }),
    ).toThrow("Province is required");
  });

  it("formats toString() correctly", () => {
    const address = Address.create({
      street: "Calle Mayor 10",
      city: "Madrid",
      province: "Madrid",
      postalCode: "28001",
    });
    expect(address.toString()).toBe("Calle Mayor 10, Madrid, Madrid 28001, España");
  });

  it("trims whitespace from all fields", () => {
    const address = Address.create({
      street: "  Calle Mayor 10  ",
      city: "  Madrid  ",
      province: "  Madrid  ",
      postalCode: " 28001 ",
    });
    expect(address.toString()).toBe("Calle Mayor 10, Madrid, Madrid 28001, España");
  });

  it("checks structural equality", () => {
    const a = Address.create({ street: "Calle Mayor 10", city: "Madrid", province: "Madrid", postalCode: "28001" });
    const b = Address.create({ street: "Calle Mayor 10", city: "Madrid", province: "Madrid", postalCode: "28001" });
    expect(a.equals(b)).toBe(true);
  });

  it("detects inequality", () => {
    const a = Address.create({ street: "Calle Mayor 10", city: "Madrid", province: "Madrid", postalCode: "28001" });
    const b = Address.create({ street: "Calle Gran Vía 1", city: "Madrid", province: "Madrid", postalCode: "28001" });
    expect(a.equals(b)).toBe(false);
  });
});
