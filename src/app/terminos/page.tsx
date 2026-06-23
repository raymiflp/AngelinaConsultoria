import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de uso de la plataforma AngelinaConsultoria.",
};

export default function TerminosPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Términos y condiciones
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Última actualización: junio de 2026
      </p>

      <Separator className="my-6" />

      <section className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <div>
          <h2 className="text-xl font-semibold">1. Aceptación</h2>
          <p>
            Al registrarte y utilizar AngelinaConsultoria aceptas estos términos y
            condiciones. Si no estás de acuerdo, no utilices la plataforma.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">2. Descripción del servicio</h2>
          <p>
            AngelinaConsultoria es una plataforma que conecta pacientes con
            profesionales de la salud para la gestión de citas, tanto
            presenciales como en modalidad de videollamada. La plataforma no
            sustituye la atención de urgencias: en caso de emergencia, contacta
            con los servicios de emergencia (112 en España).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            3. Registro y responsabilidades del usuario
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Debes proporcionar información veraz y mantenerla actualizada.
            </li>
            <li>
              Eres responsable de la confidencialidad de tus credenciales de
              acceso.
            </li>
            <li>
              Está prohibido compartir tu cuenta con terceros o utilizarla para
              fines distintos a los previstos.
            </li>
            <li>
              Los profesionales de la salud deben acreditar su colegiación
              vigente.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            4. Limitación de responsabilidad
          </h2>
          <p>
            AngelinaConsultoria actúa como intermediario tecnológico. La responsabilidad
            sobre el acto clínico recae en el profesional que presta el servicio.
            No nos hacemos responsables de la calidad asistencial, diagnósticos
            o tratamientos proporcionados a través de la plataforma.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">5. Conductas prohibidas</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Uso de la plataforma para actividades ilegales o fraudulentas.
            </li>
            <li>
              Intentar acceder a cuentas o datos de otros usuarios.
            </li>
            <li>
              Suplantar la identidad de un profesional de la salud.
            </li>
            <li>
              Distribuir malware, realizar ataques de denegación de servicio o
              cualquier actividad que comprometa la seguridad de la plataforma.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            6. Modificaciones y suspensión
          </h2>
          <p>
            Podemos modificar estos términos o suspender el servicio en
            cualquier momento, notificándolo con al menos 30 días de antelación.
            En caso de incumplimiento grave por tu parte, podemos suspender tu
            cuenta sin previo aviso.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">7. Ley aplicable</h2>
          <p>
            Estos términos se rigen por la legislación española y europea
            aplicable. Para cualquier controversia, las partes se someten a los
            juzgados y tribunales de la ciudad del usuario, salvo norma imperativa
            en contrario.
          </p>
        </div>
      </section>
    </main>
  );
}
