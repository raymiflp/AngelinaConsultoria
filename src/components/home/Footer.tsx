import Link from "next/link";

import { Separator } from "@/components/ui/separator";

/**
 * Footer — server component for the public home page.
 *
 * 4-column responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`,
 * root has `bg-muted`). All 11 link targets are real pages.
 *
 * History: when the home page was first specced (home-page-upgrade change,
 * 2026-06-16), 6 of the 11 links pointed to `href="#"` with a
 * `data-todo="home-page-upgrade"` marker. The footer-stubs housekeeping
 * change replaced them with real pages: /privacidad, /terminos, /contacto,
 * /preguntas-frecuentes, /centro-de-ayuda, /quienes-somos.
 */
const COLUMNS = [
  {
    heading: "Servicio",
    links: [
      { label: "Privacidad", href: "/privacidad" },
      { label: "Términos", href: "/terminos" },
      { label: "Quiénes somos", href: "/quienes-somos" },
      { label: "Contacto", href: "/contacto" },
    ],
  },
  {
    heading: "Para pacientes",
    links: [
      { label: "Especialidades", href: "/doctores" },
      { label: "Doctores", href: "/doctores" },
      { label: "Preguntas frecuentes", href: "/preguntas-frecuentes" },
    ],
  },
  {
    heading: "Para profesionales",
    links: [
      { label: "Activar perfil", href: "/login" },
      { label: "Zona para profesionales", href: "/login" },
      { label: "Centro de ayuda", href: "/centro-de-ayuda" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="bg-muted mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                {col.heading}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column: brand + address placeholder (different shape). */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">
              Contacto
            </h3>
            <Link
              href="/"
              className="text-base font-semibold tracking-tight"
            >
              AngelinaConsultoria
            </Link>
            <p className="text-muted-foreground mt-2 text-sm">
              AngelinaConsultoria · España
            </p>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-3 text-center md:flex-row md:text-left">
          <p className="text-muted-foreground text-sm">
            © 2026 AngelinaConsultoria. Todos los derechos reservados.
          </p>
          <p className="text-muted-foreground text-xs">
            Información orientativa. En caso de urgencia, contacta con los
            servicios de emergencia.
          </p>
        </div>
      </div>
    </footer>
  );
}
