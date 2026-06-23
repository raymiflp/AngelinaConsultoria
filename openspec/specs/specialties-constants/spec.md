# Specialties Constants Specification

## Purpose

Define the hard-coded list of 12 popular specialties that powers the home page's `SpecialtyPills` section. The constant exists because the `doctores` table stores `especialidad` as a free-text `varchar` — there is no canonical `especialidades` table, no admin UI to maintain one, and no normalization layer. A curated constant is deterministic, costs zero runtime, and matches the Doctoralia top-12 the home page references. When an `especialidades` table lands in a future change, this constant becomes the seed file for that migration.

## Requirements

### Requirement: POPULAR_SPECIALTIES Constant

A new file `src/lib/constants/specialties.ts` SHALL export a constant `POPULAR_SPECIALTIES` of type `ReadonlyArray<{ slug: string; label: string }>`. The array SHALL contain exactly 12 entries in this order, with these exact slugs and labels (Spanish):

| # | slug | label |
|---|------|-------|
| 1 | `psicologo` | `Psicólogo` |
| 2 | `ginecologo` | `Ginecólogo` |
| 3 | `traumatologo` | `Traumatólogo` |
| 4 | `dermatologo` | `Dermatólogo` |
| 5 | `psiquiatra` | `Psiquiatra` |
| 6 | `dentista` | `Dentista` |
| 7 | `medico-general` | `Médico general` |
| 8 | `otorrino` | `Otorrino` |
| 9 | `oftalmologo` | `Oftalmólogo` |
| 10 | `urologo` | `Urólogo` |
| 11 | `podologo` | `Podólogo` |
| 12 | `alergologo` | `Alergólogo` |

The array SHALL be declared with `as const` (or equivalent `ReadonlyArray` typing) so individual entries cannot be mutated at runtime.

The file SHALL also export:

- A `Specialty` type: `export type Specialty = { slug: string; label: string };`
- A helper function `getSpecialtyBySlug(slug: string): Specialty | undefined` that returns the matching entry or `undefined` if no entry matches.

#### Scenario: Constant has exactly 12 entries in documented order

- GIVEN `src/lib/constants/specialties.ts` is imported
- WHEN `POPULAR_SPECIALTIES` is read
- THEN its `length` MUST be `12`
- AND the entries MUST appear in the exact order documented above
- AND the `slug` and `label` of each entry MUST match the table above (case-sensitive, accent-sensitive)

#### Scenario: Type is exported and usable

- GIVEN the `Specialty` type is imported from the file
- WHEN it is used to annotate a variable
- THEN TypeScript MUST accept any `{ slug: string; label: string }` shape

#### Scenario: getSpecialtyBySlug returns the matching entry

- GIVEN `POPULAR_SPECIALTIES` is imported
- WHEN `getSpecialtyBySlug("psicologo")` is called
- THEN the result MUST be `{ slug: "psicologo", label: "Psicólogo" }`

#### Scenario: getSpecialtyBySlug returns undefined for unknown slug

- GIVEN `POPULAR_SPECIALTIES` is imported
- WHEN `getSpecialtyBySlug("kinesiologo")` is called (a slug not in the constant)
- THEN the result MUST be `undefined`

#### Scenario: Slug uniqueness

- GIVEN the constant is imported
- WHEN the slugs of all 12 entries are collected into a `Set`
- THEN the `Set` size MUST be `12` (no duplicate slugs)

#### Scenario: Slugs are URL-safe and lowercase

- GIVEN the constant is imported
- WHEN each entry's `slug` is inspected
- THEN every slug MUST be lowercase ASCII letters (with optional hyphens, e.g. `medico-general`)
- AND every slug MUST be safe to interpolate directly into a query string without URL-encoding

#### Scenario: Slug-of-label is consistent with the listing filter

- GIVEN a user clicks the "Psicólogo" pill on the home page
- WHEN the browser navigates
- THEN it MUST go to `/doctores?especialidad=psicologo` (the slug, not the label)
- AND the existing `/doctores` page (`src/app/doctores/page.tsx`) MUST filter the doctor list by the slug value passed in `especialidad`
- AND the filter is a case-insensitive `ILIKE` match (`%psicologo%`) per the existing `listDoctorProfiles` procedure, so slug values without accents match doctor rows whose stored `especialidad` is the accented form (e.g. "Psicólogo")

#### Scenario: Entry mutation is prevented at the type level

- GIVEN the constant is imported as `POPULAR_SPECIALTIES`
- WHEN a TypeScript consumer attempts `POPULAR_SPECIALTIES[0] = { slug: "x", label: "x" }`
- THEN TypeScript MUST reject the assignment (the array is readonly)

#### Scenario: Re-export of the specialty taxonomy for the home UI

- GIVEN the `SpecialtyPills` component is rendered
- WHEN the pills list is built
- THEN it MUST iterate over `POPULAR_SPECIALTIES` from `src/lib/constants/specialties.ts`
- AND the order of rendered pills MUST match the order of `POPULAR_SPECIALTIES`
- AND no pill list SHALL be hard-coded inside the `SpecialtyPills` component file (the component is a pure consumer of the constant)
