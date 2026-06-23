"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * HeroSearchForm — client island mounted inside the server `Hero` section.
 *
 * Two inputs:
 *  - Specialty: functional. Placeholder "Especialidad, enfermedad o nombre".
 *  - City: decorative in v1 (D4). `disabled`, `aria-label="Próximamente"`,
 *    `title="Próximamente"`, removed from the tab order.
 *
 * On submit, the trimmed specialty value is URL-encoded and pushed to
 * `/doctores?especialidad={value}`. An empty value navigates to
 * `/doctores` with no filter (the listing page interprets undefined as
 * "all"). The city field is never read.
 */
export function HeroSearchForm() {
  const router = useRouter();
  const [specialty, setSpecialty] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = specialty.trim();
    if (value.length === 0) {
      // Empty submit: no filter, no encoded value. Short-circuits cleanly.
      router.push("/doctores");
      return;
    }
    router.push(`/doctores?especialidad=${encodeURIComponent(value)}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row"
      role="search"
      aria-label="Buscar doctores"
    >
      <label htmlFor="hero-specialty" className="sr-only">
        Especialidad, enfermedad o nombre
      </label>
      <Input
        id="hero-specialty"
        name="specialty"
        type="search"
        placeholder="Especialidad, enfermedad o nombre"
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
        className="h-11 flex-1"
        autoComplete="off"
      />
      <label htmlFor="hero-city" className="sr-only">
        Ciudad (próximamente)
      </label>
      <Input
        id="hero-city"
        name="city"
        type="text"
        placeholder="Ciudad (próximamente)"
        disabled
        aria-label="Próximamente"
        title="Próximamente"
        tabIndex={-1}
        className="h-11 sm:w-48"
      />
      <Button type="submit" size="lg" className="h-11 sm:w-auto">
        <Search aria-hidden="true" />
        Buscar
      </Button>
    </form>
  );
}
