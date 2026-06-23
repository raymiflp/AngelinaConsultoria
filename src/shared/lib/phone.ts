/**
 * Phone value object — immutable, Spanish format (+34 + 9 digits).
 */
export class Phone {
  private constructor(readonly value: string) {}

  static create(input: string): Phone {
    const cleaned = input.replace(/[\s\-()]/g, "");

    if (!cleaned.startsWith("+34"))
      throw new Error("Phone must start with +34 prefix");

    const numberPart = cleaned.slice(3);
    if (!/^\d{9}$/.test(numberPart))
      throw new Error("Phone must have exactly 9 digits after +34 prefix");

    // Spanish numbering: mobile (6, 7) or landline (9)
    if (!/^[679]/.test(numberPart))
      throw new Error("Invalid Spanish phone number: must start with 6, 7, or 9");

    return new Phone(cleaned);
  }

  equals(other: Phone): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
