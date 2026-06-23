import type { Metadata } from "next";
import Link from "next/link";
import {
  HelpCircle,
  Mail,
  BookOpen,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description: "Recursos y soporte para sacar el máximo partido a AngelinaConsultoria.",
};

const RESOURCES = [
  {
    icon: HelpCircle,
    title: "Preguntas frecuentes",
    description: "Respuestas a las dudas más comunes sobre reservas, videollamadas y cuenta.",
    href: "/preguntas-frecuentes",
  },
  {
    icon: BookOpen,
    title: "Documentación",
    description: "Guías paso a paso para pacientes y profesionales.",
    href: "#proximamente",
  },
  {
    icon: ShieldCheck,
    title: "Privacidad y seguridad",
    description: "Cómo protegemos tus datos de salud conforme al RGPD.",
    href: "/privacidad",
  },
  {
    icon: CreditCard,
    title: "Facturación y pagos",
    description: "Información sobre precios, facturas y métodos de pago.",
    href: "#proximamente",
  },
  {
    icon: Mail,
    title: "Contactar con soporte",
    description: "Escríbenos y te respondemos en 24-48 horas laborables.",
    href: "/contacto",
  },
];

export default function CentroDeAyudaPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Centro de ayuda</h1>
      <p className="text-muted-foreground mt-2">
        Recursos, guías y soporte para resolver tus dudas.
      </p>

      <Separator className="my-6" />

      <div className="grid gap-4 sm:grid-cols-2">
        {RESOURCES.map(({ icon: Icon, title, description, href }) => (
          <Link
            key={title}
            href={href}
            className="hover:border-primary/40 rounded-lg border bg-card p-5 shadow-sm transition-colors"
          >
            <Icon className="text-primary size-6" />
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
