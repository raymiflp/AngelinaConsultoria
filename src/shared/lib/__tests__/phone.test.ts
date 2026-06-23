import { describe, expect, it } from "vitest";
import { Phone } from "../phone";

describe("Phone", () => {
  it("creates from a valid mobile number", () => {
    const phone = Phone.create("+34612345678");
    expect(phone.toString()).toBe("+34612345678");
  });

  it("creates from a valid landline number", () => {
    const phone = Phone.create("+34912345678");
    expect(phone.toString()).toBe("+34912345678");
  });

  it("accepts 7-prefix mobile numbers", () => {
    const phone = Phone.create("+34712345678");
    expect(phone.toString()).toBe("+34712345678");
  });

  it("strips spaces and hyphens", () => {
    const phone = Phone.create("+34 612 345 678");
    expect(phone.toString()).toBe("+34612345678");
  });

  it("strips parentheses", () => {
    const phone = Phone.create("+34(6)12345678");
    expect(phone.toString()).toBe("+34612345678");
  });

  it("rejects French prefix", () => {
    expect(() => Phone.create("+33612345678")).toThrow("must start with +34 prefix");
  });

  it("rejects US prefix", () => {
    expect(() => Phone.create("+14155551234")).toThrow("must start with +34 prefix");
  });

  it("rejects too few digits (8 after prefix)", () => {
    expect(() => Phone.create("+3461234567")).toThrow("exactly 9 digits");
  });

  it("rejects too many digits (10 after prefix)", () => {
    expect(() => Phone.create("+346123456789")).toThrow("exactly 9 digits");
  });

  it("rejects invalid Spanish prefix (starts with 5)", () => {
    expect(() => Phone.create("+34512345678")).toThrow("must start with 6, 7, or 9");
  });

  it("checks structural equality", () => {
    const a = Phone.create("+34612345678");
    const b = Phone.create("+34 612 345 678");
    expect(a.equals(b)).toBe(true);
  });

  it("detects inequality", () => {
    const a = Phone.create("+34612345678");
    const b = Phone.create("+34912345678");
    expect(a.equals(b)).toBe(false);
  });
});
