import { describe, expect, it } from "vitest";

import {
  POPULAR_SPECIALTIES,
  getSpecialtyBySlug,
  type Specialty,
} from "@/lib/constants/specialties";

describe("POPULAR_SPECIALTIES", () => {
  it("contains exactly 12 entries in documented order", () => {
    expect(POPULAR_SPECIALTIES).toHaveLength(12);

    const expected: ReadonlyArray<Specialty> = [
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
    ];

    expect(POPULAR_SPECIALTIES).toEqual(expected);
  });

  it("has unique slugs (no duplicates)", () => {
    const slugs = POPULAR_SPECIALTIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses lowercase ASCII slugs that are URL-safe", () => {
    for (const entry of POPULAR_SPECIALTIES) {
      // lowercase ASCII letters or hyphens only — no accents, no spaces
      expect(entry.slug).toMatch(/^[a-z-]+$/);
      // safe to interpolate into a query string without URL-encoding
      expect(encodeURIComponent(entry.slug)).toBe(entry.slug);
    }
  });
});

describe("getSpecialtyBySlug", () => {
  it("returns the matching entry for a known slug", () => {
    expect(getSpecialtyBySlug("psicologo")).toEqual({
      slug: "psicologo",
      label: "Psicólogo",
    });
  });

  it("returns undefined for an unknown slug", () => {
    expect(getSpecialtyBySlug("kinesiologo")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getSpecialtyBySlug("")).toBeUndefined();
  });
});
