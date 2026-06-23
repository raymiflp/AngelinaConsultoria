import { Search, CalendarCheck, Bell, BadgeCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * ValueProps — server component for the home page.
 *
 * Renders an `<h2>` plus 4 cards in a responsive grid
 * (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Each card has a
 * `lucide-react` icon at 24×24 (aria-hidden), a title, and a short
 * description. The order and copy are the documented marketing list
 * (Search → CalendarCheck → Bell → BadgeCheck).
 */
const VALUE_PROPS = [
  {
    icon: Search,
    title: "Encuentra tu especialista",
    description: "Explora perfiles verificados y elige al profesional ideal.",
  },
  {
    icon: CalendarCheck,
    title: "Pide cita de forma fácil",
    description: "Reserva online sin necesidad de llamar.",
  },
  {
    icon: Bell,
    title: "Recordatorios automáticos",
    description: "Te avisamos antes de cada cita.",
  },
  {
    icon: BadgeCheck,
    title: "Profesionales verificados",
    description: "Todos los doctores pasan un proceso de verificación.",
  },
] as const;

export function ValueProps() {
  return (
    <section
      className="bg-muted/30 py-12 md:py-16"
      aria-labelledby="value-props-heading"
    >
      <div className="container mx-auto px-4">
        <h2
          id="value-props-heading"
          className="mb-8 text-center text-2xl font-bold tracking-tight md:text-3xl"
        >
          ¿Por qué AngelinaConsultoria?
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="w-full">
              <CardHeader>
                <Icon
                  aria-hidden="true"
                  className="text-primary size-6"
                />
                <CardTitle className="text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
