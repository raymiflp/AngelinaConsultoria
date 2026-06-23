/**
 * Address value object — immutable, Spanish format with 5-digit postal code.
 */
export class Address {
  private constructor(
    readonly street: string,
    readonly city: string,
    readonly province: string,
    readonly postalCode: string,
    readonly country: string,
  ) {}

  static create(props: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
    country?: string;
  }): Address {
    const street = props.street.trim();
    const city = props.city.trim();
    const province = props.province.trim();
    const postalCode = props.postalCode.trim();
    const country = (props.country || "España").trim();

    if (!street) throw new Error("Street is required");
    if (!city) throw new Error("City is required");
    if (!province) throw new Error("Province is required");
    if (!country) throw new Error("Country is required");

    if (!/^\d{5}$/.test(postalCode))
      throw new Error("Postal code must be exactly 5 digits");

    return new Address(street, city, province, postalCode, country);
  }

  equals(other: Address): boolean {
    return (
      this.street === other.street &&
      this.city === other.city &&
      this.province === other.province &&
      this.postalCode === other.postalCode &&
      this.country === other.country
    );
  }

  toString(): string {
    return `${this.street}, ${this.city}, ${this.province} ${this.postalCode}, ${this.country}`;
  }
}
