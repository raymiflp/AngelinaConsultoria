import { HeroSearchForm } from "@/components/home/HeroSearchForm";
import { TrustCounter } from "@/components/home/TrustCounter";

interface HeroProps {
  totalVerifiedDoctors: number;
  totalSpecialties: number;
}

/**
 * Hero — server component for the public home page's first section.
 *
 * Renders the h1 headline, the sub-headline, the `HeroSearchForm` client
 * island, and the `TrustCounter`. The trust counter self-hides when
 * `totalVerifiedDoctors === 0` (REQ-HOME-UI-3 / D3) — Hero does not
 * guard the zero state itself, it delegates to TrustCounter so the
 * invariant lives in exactly one place.
 */
export function Hero({ totalVerifiedDoctors, totalSpecialties }: HeroProps) {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Encuentra tu especialista y pide cita
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Tu plataforma de salud digital para conectar pacientes con doctores.
        </p>
        <div className="mt-8">
          <HeroSearchForm />
        </div>
        <div className="mt-4">
          <TrustCounter
            totalVerifiedDoctors={totalVerifiedDoctors}
            totalSpecialties={totalSpecialties}
          />
        </div>
      </div>
    </section>
  );
}
