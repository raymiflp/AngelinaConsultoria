const LETTER_TABLE = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * DNI_NIE value object — immutable, validates Spanish identity documents
 * using the official modulo-23 letter algorithm.
 *
 * DNI: 8 digits + letter (e.g. 12345678Z)
 * NIE: X/Y/Z + 7 digits + letter (e.g. X1234567L, where X→0, Y→1, Z→2)
 */
export class DNI_NIE {
  private constructor(readonly value: string) {}

  static create(input: string): DNI_NIE {
    const normalized = input.trim().toUpperCase();

    // DNI: 8 digits + letter
    // NIE: X/Y/Z + 7 digits + letter
    if (!/^\d{8}[A-Z]$/.test(normalized) && !/^[XYZ]\d{7}[A-Z]$/.test(normalized))
      throw new Error("Invalid DNI/NIE format");

    const letter = normalized.slice(-1);
    let numberPart: number;

    if (/^\d{8}[A-Z]$/.test(normalized)) {
      numberPart = Number.parseInt(normalized.slice(0, 8), 10);
    } else {
      const prefix = normalized[0]!;
      const numericPrefix = prefix === "X" ? "0" : prefix === "Y" ? "1" : "2";
      numberPart = Number.parseInt(numericPrefix + normalized.slice(1, 8), 10);
    }

    const expectedLetter = LETTER_TABLE[numberPart % 23];
    if (letter !== expectedLetter)
      throw new Error(
        `Invalid DNI/NIE letter: expected "${expectedLetter}", got "${letter}"`,
      );

    return new DNI_NIE(normalized);
  }

  equals(other: DNI_NIE): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
