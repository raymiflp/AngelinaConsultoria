import { describe, expect, it } from "vitest";
import { Email } from "../email";

describe("Email", () => {
  it("creates from a valid email address", () => {
    const email = Email.create("usuario@example.com");
    expect(email.toString()).toBe("usuario@example.com");
  });

  it("normalizes to lowercase", () => {
    const email = Email.create("User@Example.COM");
    expect(email.toString()).toBe("user@example.com");
  });

  it("rejects empty string", () => {
    expect(() => Email.create("")).toThrow("Email cannot be empty");
  });

  it("rejects missing @ symbol", () => {
    expect(() => Email.create("usuarioejemplo.com")).toThrow("Invalid email format");
  });

  it("rejects missing domain", () => {
    expect(() => Email.create("usuario@")).toThrow("Invalid email format");
  });

  it("rejects missing local part", () => {
    expect(() => Email.create("@example.com")).toThrow("Invalid email format");
  });

  it("checks structural equality after normalization", () => {
    const a = Email.create("User@Example.COM");
    const b = Email.create("user@example.com");
    expect(a.equals(b)).toBe(true);
  });

  it("detects inequality", () => {
    const a = Email.create("user@example.com");
    const b = Email.create("other@example.com");
    expect(a.equals(b)).toBe(false);
  });

  it("returns value from toString()", () => {
    const email = Email.create("test@domain.com");
    expect(email.toString()).toBe("test@domain.com");
  });

  it("trims whitespace", () => {
    const email = Email.create("  user@example.com  ");
    expect(email.toString()).toBe("user@example.com");
  });
});
