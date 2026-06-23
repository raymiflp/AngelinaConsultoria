import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POPULAR_SPECIALTIES } from "@/lib/constants/specialties";

/**
 * SpecialtyPills — server component for the home page.
 *
 * Renders a horizontal row of clickable pills (shadcn `Badge`) linking to
 * `/doctores?especialidad={slug}` plus a 13th "Ver más" element linking to
 * the listing page without a filter. The list of pills is the 12 entries
 * from `POPULAR_SPECIALTIES` in constant order (Psicólogo first, Alergólogo
 * last). On mobile (<md) the row scrolls horizontally without wrapping;
 * on ≥md it can wrap as a graceful fallback.
 */
export function SpecialtyPills() {
  return (
    <section
      className="container mx-auto px-4 py-12 md:py-16"
      aria-labelledby="specialty-pills-heading"
    >
      <h2
        id="specialty-pills-heading"
        className="sr-only"
      >
        Especialidades populares
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible md:pb-0">
        {POPULAR_SPECIALTIES.map((specialty) => (
          <Link
            key={specialty.slug}
            href={`/doctores?especialidad=${specialty.slug}`}
            className="shrink-0"
          >
            <Badge
              variant="secondary"
              className="hover:bg-secondary/80 cursor-pointer px-3 py-1 text-sm transition-colors"
            >
              {specialty.label}
            </Badge>
          </Link>
        ))}
        <Button
          variant="link"
          size="sm"
          asChild
          className="shrink-0 gap-1"
        >
          <Link href="/doctores">
            Ver más
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
