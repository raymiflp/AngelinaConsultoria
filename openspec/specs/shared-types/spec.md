# Shared Types Specification

## Purpose

Define validated, immutable value objects used across all domains: Email, Phone, DNI_NIE, FullName, and Address. Every value object MUST validate input on construction, MUST be immutable after creation, MUST implement `toString()`, and MUST implement `equals()` for structural comparison.

## Requirements

### Requirement: Email Validation and Normalization

The system MUST validate email addresses per RFC 5321 simplified rules and MUST normalize the local part by lowercasing before storage. The system MUST reject addresses without an `@` symbol, without a domain, or with invalid domain characters. The system SHOULD strip known comment syntax (`+` suffix) per RFC 5233 when configured.

#### Scenario: Valid email accepted

- GIVEN a string `"usuario@example.com"`
- WHEN an `Email` value object is constructed
- THEN the object is created successfully AND `toString()` returns `"usuario@example.com"`

#### Scenario: Missing @ symbol rejected

- GIVEN a string `"usuarioejemplo.com"`
- WHEN an `Email` value object is constructed
- THEN a `ValidationError` MUST be thrown

#### Scenario: Structural equality

- GIVEN two `Email` instances from `"User@Example.COM"` and `"user@example.com"`
- WHEN `equals()` is called
- THEN it MUST return `true` (normalized lowercase)

### Requirement: Phone Validation (Spanish Format)

The system MUST validate Spanish phone numbers with the `+34` international prefix followed by exactly 9 digits. Mobile prefixes (starting with 6 or 7) and landline prefixes (starting with 9) MUST be accepted. Numbers without `+34` prefix MUST be rejected. Non-digit characters (spaces, hyphens, parentheses) MUST be stripped before validation.

#### Scenario: Valid mobile number accepted

- GIVEN a string `"+34612345678"`
- WHEN a `Phone` value object is constructed
- THEN the object is created AND `toString()` returns `"+34612345678"`

#### Scenario: Invalid prefix rejected

- GIVEN a string `"+33612345678"` (French prefix)
- WHEN a `Phone` value object is constructed
- THEN a `ValidationError` MUST be thrown

#### Scenario: Too few digits rejected

- GIVEN a string `"+3461234567"` (8 digits after prefix)
- WHEN a `Phone` value object is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: DNI_NIE Validation (Spanish Identity Document)

The system MUST validate Spanish DNI and NIE documents. For DNI (8 digits + letter), the system MUST verify the letter against the official modulo-23 algorithm. For NIE (letter X/Y/Z + 7 digits + letter), the system MUST replace the leading letter with its numeric equivalent (X→0, Y→1, Z→2) and apply the same letter algorithm. The system MUST reject any document that fails the letter check.

#### Scenario: Valid DNI accepted

- GIVEN a string `"12345678Z"`
- WHEN a `DNI_NIE` value object is constructed
- THEN the object is created AND `toString()` returns `"12345678Z"`

#### Scenario: Invalid DNI letter rejected

- GIVEN a string `"12345678A"` (letter A does not match modulo-23 for 12345678)
- WHEN a `DNI_NIE` value object is constructed
- THEN a `ValidationError` MUST be thrown

#### Scenario: Valid NIE accepted

- GIVEN a string `"X1234567L"` (X→0, 01234567 → letter L)
- WHEN a `DNI_NIE` value object is constructed
- THEN the object is created

### Requirement: FullName Validation

The system MUST validate `FullName` as a first name and at least one last name. Each name part MUST be at least 2 characters long and MUST contain only alphabetic Unicode characters, hyphens, apostrophes, and spaces. Leading and trailing whitespace MUST be trimmed on construction.

#### Scenario: Valid full name accepted

- GIVEN a first name `"María"` and last name `"García López"`
- WHEN a `FullName` value object is constructed
- THEN `toString()` returns `"María García López"`

#### Scenario: Too-short name rejected

- GIVEN a first name `"A"` and last name `"García"`
- WHEN a `FullName` value object is constructed
- THEN a `ValidationError` MUST be thrown

### Requirement: Address Value Object

The `Address` value object MUST contain street, city, province, postal code, and country (defaulting to `"España"`). The postal code MUST match Spanish format (5 digits). Each field MUST be a non-empty trimmed string.

#### Scenario: Complete address accepted

- GIVEN street `"Calle Mayor 10"`, city `"Madrid"`, province `"Madrid"`, postal code `"28001"`
- WHEN an `Address` value object is constructed
- THEN all fields are accessible via getters AND `toString()` returns a formatted string

#### Scenario: Invalid postal code rejected

- GIVEN a postal code `"999"` (less than 5 digits)
- WHEN an `Address` value object is constructed
- THEN a `ValidationError` MUST be thrown
