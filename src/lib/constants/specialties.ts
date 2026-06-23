/**
 * Curated top-12 list of popular specialties used on the public home page.
 *
 * The `doctores.especialidad` column is a free-text `varchar` — there is no
 * canonical `especialidades` table, no admin UI to maintain one, and no
 * normalization layer. A curated constant is deterministic, costs zero runtime,
 * and matches the Doctoralia top-12 the home page references.
 *
 * When an `especialidades` table ships (a separate future change), this
 * constant becomes the seed file for that migration. Do not add entries here
 * that are not in production (no `kinesiologo`, no `nutricionista` until the
 * table says so).
 */
export const POPULAR_SPECIALTIES = [
  { slug: "psicologo", label: "Psicólogo" },
  { slug: "ginecologo", label: "Ginecólogo" },
  { slug: "traumatologo", label: "Traumatólogo" },
  { slug: "dermatologo", label: "Dermatólogo" },
  { slug: "psiquiatra", label: "Psiquiatra" },
  { slug: "dentista", label: "Dentista" },
  { slug: "medico-general", label: "Médico general" },
  { slug: "otorrino", label: "Otorrino" },
  { slug: "oftalmologo", label: "Oftalmólogo" },
  { slug: "urologo", label: "Urólogo" },
  { slug: "podologo", label: "Podólogo" },
  { slug: "alergologo", label: "Alergólogo" },
] as const satisfies ReadonlyArray<Specialty>;

export type Specialty = { slug: string; label: string };
export type SpecialtySlug = (typeof POPULAR_SPECIALTIES)[number]["slug"];

/**
 * Returns the matching entry for a slug, or `undefined` when no entry matches.
 * Slugs are lowercase ASCII (accents live on labels, not slugs).
 */
export function getSpecialtyBySlug(slug: string): Specialty | undefined {
  return POPULAR_SPECIALTIES.find((s) => s.slug === slug);
}
