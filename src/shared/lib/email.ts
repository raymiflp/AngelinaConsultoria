/**
 * Email value object — immutable, RFC 5321 simplified validation.
 */
export class Email {
  private constructor(readonly value: string) {}

  static create(input: string): Email {
    if (typeof input !== "string" || input.trim().length === 0)
      throw new Error("Email cannot be empty");

    const normalized = input.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      throw new Error("Invalid email format");

    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
