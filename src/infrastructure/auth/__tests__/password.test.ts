import { describe, it, expect } from "vitest";
import { hash, verify } from "../password";

describe("password hashing", () => {
  it("hash and verify roundtrip succeeds for a valid password", async () => {
    const password = "SecurePass123";
    const hashed = await hash(password);

    expect(hashed).toBeTruthy();
    // bcryptjs outputs $2b$ prefix (not $2a$) in JS environments
    expect(hashed.startsWith("$2b$12$")).toBe(true);

    const result = await verify(password, hashed);
    expect(result).toBe(true);
  });

  it("returns false when verifying with an incorrect password", async () => {
    const password = "SecurePass123";
    const wrongPassword = "WrongPass456";
    const hashed = await hash(password);

    const result = await verify(wrongPassword, hashed);
    expect(result).toBe(false);
  });

  it("returns false when verifying an empty string against a real hash", async () => {
    const password = "SecurePass123";
    const hashed = await hash(password);

    const result = await verify("", hashed);
    expect(result).toBe(false);
  });

  it("produces different hashes for the same password (salting)", async () => {
    const password = "SecurePass123";
    const hash1 = await hash(password);
    const hash2 = await hash(password);

    expect(hash1).not.toBe(hash2);
  });
});
