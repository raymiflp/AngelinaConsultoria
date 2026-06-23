/**
 * FullName value object — immutable, validated Spanish full name.
 */
export class FullName {
  private constructor(
    readonly firstName: string,
    readonly lastName: string,
  ) {}

  static create(firstName: string, lastName: string): FullName {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (trimmedFirst.length < 2)
      throw new Error("First name must be at least 2 characters");
    if (trimmedLast.length < 2)
      throw new Error("Last name must be at least 2 characters");

    // Unicode letters, hyphens, apostrophes, spaces
    const nameRegex = /^[\p{L}\-'\s]{2,}$/u;
    if (!nameRegex.test(trimmedFirst))
      throw new Error("First name contains invalid characters");
    if (!nameRegex.test(trimmedLast))
      throw new Error("Last name contains invalid characters");

    return new FullName(trimmedFirst, trimmedLast);
  }

  equals(other: FullName): boolean {
    return this.firstName === other.firstName && this.lastName === other.lastName;
  }

  toString(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
