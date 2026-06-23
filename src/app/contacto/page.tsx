import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Cómo contactar con el equipo de AngelinaConsultoria.",
};

export default function ContactoPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Contacto</h1>
      <p className="text-muted-foreground mt-2">
        Estamos aquí para ayudarte. Elige el canal que mejor se adapte a tu
        consulta.
      </p>

      <Separator className="my-6" />

      <section className="grid gap-6 md:grid-cols-3">
        <article className="rounded-lg border bg-card p-6 shadow-sm">
          <Mail className="text-primary size-6" />
          <h2 className="mt-3 text-lg font-semibold">Email</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Respuesta en 24-48 horas laborables.
          </p>
          <a
            href="mailto:hola@angelinaconsultoria.example"
            className="text-foreground mt-3 inline-block text-sm font-medium underline"
          >
            hola@angelinaconsultoria.example
          </a>
        </article>

        <article className="rounded-lg border bg-card p-6 shadow-sm">
          <Phone className="text-primary size-6" />
          <h2 className="mt-3 text-lg font-semibold">Teléfono</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Lunes a viernes, 9:00 - 18:00.
          </p>
          <a
            href="tel:+34900000000"
            className="text-foreground mt-3 inline-block text-sm font-medium underline"
          >
            +34 900 000 000
          </a>
        </article>

        <article className="rounded-lg border bg-card p-6 shadow-sm">
          <MapPin className="text-primary size-6" />
          <h2 className="mt-3 text-lg font-semibold">Oficina</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            C/ Josep Pla 2, Edificio B2, planta 13
            <br />
            08019 Barcelona, España
          </p>
        </article>
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="text-xl font-semibold">Consultas por tema</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <span className="font-medium">Soporte técnico:</span>{" "}
            <a
              href="mailto:soporte@angelinaconsultoria.example"
              className="underline"
            >
              soporte@angelinaconsultoria.example
            </a>
          </li>
          <li>
            <span className="font-medium">Privacidad y datos:</span>{" "}
            <a
              href="mailto:privacidad@angelinaconsultoria.example"
              className="underline"
            >
              privacidad@angelinaconsultoria.example
            </a>
          </li>
          <li>
            <span className="font-medium">Profesionales (alta de perfil):</span>{" "}
            <a
              href="mailto:profesionales@angelinaconsultoria.example"
              className="underline"
            >
              profesionales@angelinaconsultoria.example
            </a>
          </li>
          <li>
            <span className="font-medium">Prensa:</span>{" "}
            <a
              href="mailto:prensa@angelinaconsultoria.example"
              className="underline"
            >
              prensa@angelinaconsultoria.example
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
