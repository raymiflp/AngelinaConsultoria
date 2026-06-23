import type { Metadata } from "next";
import { Heart, Users, ShieldCheck, Sparkles } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Quiénes somos",
  description: "La historia y misión del equipo de AngelinaConsultoria.",
};

const VALUES = [
  {
    icon: Heart,
    title: "Cuidado centrado en la persona",
    description:
      "Cada decisión de producto parte de una pregunta: ¿esto mejora la atención que recibe el paciente?",
  },
  {
    icon: Users,
    title: "Acceso universal a la salud",
    description:
      "Trabajamos para que cualquier persona, en cualquier lugar, pueda encontrar un profesional verificado.",
  },
  {
    icon: ShieldCheck,
    title: "Privacidad por defecto",
    description:
      "Los datos de salud son los más sensibles que existen. Los tratamos como trataríamos los nuestros.",
  },
  {
    icon: Sparkles,
    title: "Tecnología al servicio, no al revés",
    description:
      "La tecnología debe liberar tiempo del profesional, no añadir más pantallas y más clics.",
  },
];

export default function QuienesSomosPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Quiénes somos</h1>
      <p className="text-muted-foreground mt-2">
        AngelinaConsultoria es una plataforma española que conecta a pacientes con
        profesionales de la salud verificados.
      </p>

      <Separator className="my-6" />

      <section className="prose prose-slate dark:prose-invert max-w-none space-y-4">
        <p>
          Nacimos con una idea simple: encontrar un médico de confianza debería
          ser tan fácil como pedir comida a domicilio. Empezamos en 2024 con un
          equipo pequeño en Barcelona y hoy ayudamos a miles de pacientes a
          reservar citas con cientos de profesionales verificados.
        </p>
        <p>
          No queremos reemplazar la relación médico-paciente. Queremos
          facilitar el primer paso: encontrar al profesional adecuado y
          reservar la cita sin fricciones. Una vez en la consulta (o en la
          videollamada), la tecnología desaparece.
        </p>
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="text-xl font-semibold">Nuestros valores</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {VALUES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-lg border bg-card p-4">
              <Icon className="text-primary size-5" />
              <h3 className="mt-2 text-base font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
